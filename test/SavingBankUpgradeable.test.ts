
import "@nomicfoundation/hardhat-ethers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  MockStablecoin,
  SavingBankUpgradeableFactory,
  SavingBankUpgradeable,
  DepositCertificateUpgradeable,
  DepositRegistry,
} from "../typechain";

const ONE_DAY = 24 * 60 * 60;

describe("SavingBankUpgradeable", function () {
  let deployer: SignerWithAddress,
    user: SignerWithAddress;

  let token: MockStablecoin;
  let factory: SavingBankUpgradeableFactory;
  let bank: SavingBankUpgradeable;
  let registry: DepositRegistry;
  let certificate: DepositCertificateUpgradeable;

  const setup = async () => {
    [deployer, user] = await ethers.getSigners();

    // 1. Deploy mock stablecoin
    const TokenFactory = await ethers.getContractFactory("MockStablecoin");
    token = (await TokenFactory.deploy("Mock USD", "mUSD", 18)) as MockStablecoin;
    await token.waitForDeployment();

    // Mint token cho deployer và user để test
    const mintAmount = ethers.parseUnits("1000000", 18);
    await (await token.mint(deployer.address, mintAmount)).wait();
    await (await token.mint(user.address, mintAmount)).wait();

    // 2. Deploy factory
    const Factory = await ethers.getContractFactory("SavingBankUpgradeableFactory");
    factory = (await Factory.deploy()) as SavingBankUpgradeableFactory;
    await factory.waitForDeployment();

    // 3. Tạo một bank instance qua factory
    const name = "Mock Saving Certificate";
    const symbol = "MSC";

    const tx = await factory.createSavingBank(
      await token.getAddress(),
      name,
      symbol
    );
    await tx.wait();

    const total = await factory.allBanksLength();
    const lastIndex = total - 1n;
    const bankInfo = await factory.allBanks(lastIndex);

    const coreAddr = bankInfo.core;
    const registryAddr = bankInfo.registry;
    const certAddr = bankInfo.certificate;

    bank = (await ethers.getContractAt(
      "SavingBankUpgradeable",
      coreAddr
    )) as SavingBankUpgradeable;
    registry = (await ethers.getContractAt(
      "DepositRegistry",
      registryAddr
    )) as DepositRegistry;
    certificate = (await ethers.getContractAt(
      "DepositCertificateUpgradeable",
      certAddr
    )) as DepositCertificateUpgradeable;

    // 4. Tạo saving plan cơ bản
    const tenorDays = 30;
    const aprBps = 500; // 5%
    const minDeposit = ethers.parseUnits("100", 18);
    const maxDeposit = 0; // unlimited
    const earlyWithdrawPenaltyBps = 5000; // 50%

    await (
      await bank.createPlan(
        tenorDays,
        aprBps,
        minDeposit,
        maxDeposit,
        earlyWithdrawPenaltyBps,
        true
      )
    ).wait();

    // 5. Fund vault để trả lãi
    const vaultFund = ethers.parseUnits("10000", 18);
    await (await token.approve(await bank.getAddress(), vaultFund)).wait();
    await (await bank.fundVault(vaultFund)).wait();
  };

  beforeEach(async () => {
    await setup();
  });

  it("deploys and links core, certificate, token đúng", async function () {
    expect(await bank.token()).to.equal(await token.getAddress());
    expect(await certificate.savingBankCore()).to.equal(await bank.getAddress());
    expect(await certificate.owner()).to.equal((await ethers.getSigners())[0].address);
  });

  it("openDeposit tạo deposit và mint certificate", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();

    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const activeId = await bank.connect(user).getMyActiveDepositId();
    expect(activeId).to.not.equal(0n);

    const dep = await registry.deposits(activeId);
    expect(dep.owner).to.equal(user.address);
    expect(dep.principal).to.equal(amount);

    const certOwner = await certificate.ownerDepositCertificateOf(activeId);
    expect(certOwner).to.equal(user.address);
  });

  it("withdrawAtMaturity trả principal + interest và burn certificate", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const depositId = await bank.connect(user).getMyActiveDepositId();
    const dep = await registry.deposits(depositId);

    // tăng thời gian đến sau maturity
    const now = await ethers.provider.getBlock("latest");
    const maturity = Number(dep.maturityAt);
    const currentTs = now?.timestamp ?? Math.floor(Date.now() / 1000);
    const delta = maturity - currentTs + 1;
    await ethers.provider.send("evm_increaseTime", [delta]);
    await ethers.provider.send("evm_mine", []);

    const balanceBefore = await token.balanceOf(user.address);

    await (await bank.connect(user).withdrawAtMaturity(depositId)).wait();

    const balanceAfter = await token.balanceOf(user.address);
    const gained = balanceAfter - balanceBefore;

    // gained = principal + interest
    expect(gained > amount).to.be.true;

    const activeAfter = await bank.connect(user).getMyActiveDepositId();
    expect(activeAfter).to.equal(0n);

    // certificate đã bị burn (user không còn NFT)
    const certBalance = await certificate.balanceOf(user.address);
    expect(certBalance).to.equal(0n);
  });

  it("earlyWithdraw trả principal - penalty và gửi penalty cho feeReceiver", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const depositId = await bank.connect(user).getMyActiveDepositId();
    const dep = await registry.deposits(depositId);

    const feeReceiver = await bank.feeReceiver();

    const userBefore = await token.balanceOf(user.address);
    const feeBefore = await token.balanceOf(feeReceiver);

    await (await bank.connect(user).earlyWithdraw(depositId)).wait();

    const userAfter = await token.balanceOf(user.address);
    const feeAfter = await token.balanceOf(feeReceiver);

    const userDelta = userAfter - userBefore;
    const feeDelta = feeAfter - feeBefore;

    const expectedPenalty = (dep.principal * BigInt(dep.earlyWithdrawPenaltyBps)) / 10000n;
    expect(userDelta + feeDelta).to.equal(dep.principal);
    expect(feeDelta).to.equal(expectedPenalty);
  });

  it("renewDeposit roll principal + interest sang plan mới", async function () {
    const amount = ethers.parseUnits("2000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const depositId = await bank.connect(user).getMyActiveDepositId();
    const dep = await registry.deposits(depositId);

    // tăng thời gian đến sau maturity
    const now = await ethers.provider.getBlock("latest");
    const maturity = Number(dep.maturityAt);
    const currentTs = now?.timestamp ?? Math.floor(Date.now() / 1000);
    const delta = maturity - currentTs + 1;
    await ethers.provider.send("evm_increaseTime", [delta]);
    await ethers.provider.send("evm_mine", []);

    const tx = await bank.connect(user).renewDeposit(depositId, 1);
    const receipt = await tx.wait();

    // active deposit mới
    const newDepositId = await bank.connect(user).getMyActiveDepositId();
    expect(newDepositId).to.not.equal(0n);
    expect(newDepositId).to.not.equal(depositId);

    const newDep = await registry.deposits(newDepositId);
    expect(newDep.owner).to.equal(user.address);
    expect(newDep.planId).to.equal(1n);

    // old deposit đã đổi trạng thái
    const oldDep = await registry.deposits(depositId);
    expect(oldDep.status).to.equal(3n); // DepositStatus.Renewed
  });

  it("admin: createPlan và updatePlan chỉ owner được gọi", async function () {
    const tenorDays = 60n;
    const aprBps = 300n;
    const minDeposit = ethers.parseUnits("50", 18);
    const maxDeposit = ethers.parseUnits("10000", 18);
    const penaltyBps = 2000n;

    const nextIdBefore = await bank.nextPlanId();

    await (
      await bank
        .connect(deployer)
        .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true)
    ).wait();

    const created = await bank.plans(nextIdBefore);
    expect(created.tenorDays).to.equal(tenorDays);
    expect(created.aprBps).to.equal(aprBps);
    expect(created.minDeposit).to.equal(minDeposit);
    expect(created.maxDeposit).to.equal(maxDeposit);
    expect(created.earlyWithdrawPenaltyBps).to.equal(penaltyBps);

    let failed = false;
    try {
      await bank
        .connect(user)
        .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);

    await (
      await bank
        .connect(deployer)
        .updatePlan(nextIdBefore, tenorDays, aprBps + 100n, minDeposit, maxDeposit, penaltyBps, false)
    ).wait();

    const updated = await bank.plans(nextIdBefore);
      expect(updated.aprBps).to.equal(aprBps + 100n);
    expect(updated.enabled).to.equal(false);
  });

  it("admin: setFeeReceiver, fundVault, withdrawVault hoạt động đúng", async function () {
    const newFee = user.address;

    await (await bank.connect(deployer).setFeeReceiver(newFee)).wait();
    expect(await bank.feeReceiver()).to.equal(newFee);

    const fundAmount = ethers.parseUnits("1000", 18);
    await (await token.approve(await bank.getAddress(), fundAmount)).wait();

    const vaultBefore = await bank.vaultBalance();
    await (await bank.connect(deployer).fundVault(fundAmount)).wait();
    const vaultAfterFund = await bank.vaultBalance();
    expect(vaultAfterFund - vaultBefore).to.equal(fundAmount);

    const ownerBalanceBefore = await token.balanceOf(deployer.address);
    const withdrawAmount = ethers.parseUnits("500", 18);

    await (await bank.connect(deployer).withdrawVault(withdrawAmount)).wait();

    const vaultAfterWithdraw = await bank.vaultBalance();
    expect(vaultAfterFund - vaultAfterWithdraw).to.equal(withdrawAmount);

    const ownerBalanceAfter = await token.balanceOf(deployer.address);
    expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(withdrawAmount);

    let failed = false;
    try {
      await bank.connect(user).withdrawVault(withdrawAmount);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("admin: pause ngăn user openDeposit và unpause cho phép lại", async function () {
    await (await bank.connect(deployer).pause()).wait();

    const amount = ethers.parseUnits("1000", 18);
    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();

    let failed = false;
    try {
      await bank.connect(user).openDeposit(1, amount);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);

    await (await bank.connect(deployer).unpause()).wait();

    await (await bank.connect(user).openDeposit(1, amount)).wait();
    const activeId = await bank.connect(user).getMyActiveDepositId();
    expect(activeId).to.not.equal(0n);
  });

  it("user: getActiveDepositId phản ánh đúng active deposit và chặn double-deposit", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const myId = await bank.connect(user).getMyActiveDepositId();
    expect(myId).to.not.equal(0n);

    const byAddr = await bank.getActiveDepositId(user.address);
    expect(byAddr).to.equal(myId);

    const deployerId = await bank.getActiveDepositId(deployer.address);
    expect(deployerId).to.equal(0n);

    let failed = false;
    try {
      await bank.connect(user).openDeposit(1, amount);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("user: withdrawAtMaturity revert nếu chưa đến ngày đáo hạn", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const depositId = await bank.connect(user).getMyActiveDepositId();

    let failed = false;
    try {
      await bank.connect(user).withdrawAtMaturity(depositId);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("user: earlyWithdraw revert nếu đã qua ngày đáo hạn", async function () {
    const amount = ethers.parseUnits("1000", 18);

    await (await token.connect(user).approve(await bank.getAddress(), amount)).wait();
    await (await bank.connect(user).openDeposit(1, amount)).wait();

    const depositId = await bank.connect(user).getMyActiveDepositId();
    const dep = await registry.deposits(depositId);

    const now = await ethers.provider.getBlock("latest");
    const maturity = Number(dep.maturityAt);
    const currentTs = now?.timestamp ?? Math.floor(Date.now() / 1000);
    const delta = maturity - currentTs + 1;
    await ethers.provider.send("evm_increaseTime", [delta]);
    await ethers.provider.send("evm_mine", []);

    let failed = false;
    try {
      await bank.connect(user).earlyWithdraw(depositId);
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
