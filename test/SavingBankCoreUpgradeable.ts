import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

async function deploySavingBankFixture() {
  const [owner, user, other] = await ethers.getSigners();

  // Deploy mock stablecoin
  const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
  const token = await MockStablecoin.deploy("Mock USD", "mUSD", 18);

  const initialSupply = ethers.parseUnits("1000000", 18);
  await token.mint(owner.address, initialSupply);
  await token.mint(user.address, initialSupply);

  // Deploy factory
  const Factory = await ethers.getContractFactory("SavingBankUpgradeableFactory");
  const factory = await Factory.deploy();

  // Create a new saving bank (core + certificate)
  await factory.createSavingBank(token, "Saving NFT", "SVNFT");

  const [coreAddr, certificateAddr] = await factory.getBankDeployment(0);

  const Core = await ethers.getContractFactory("SavingBankCoreUpgradeable");
  const Certificate = await ethers.getContractFactory("DepositCertificateUpgradeable");

  const core = Core.attach(coreAddr);
  const certificate = Certificate.attach(certificateAddr);

  return { owner, user, other, token, factory, core, certificate };
}

describe("SavingBankCoreUpgradeable", function () {
  describe("Admin plan & vault", function () {
    it("should allow owner to create a valid plan", async function () {
      const { owner, core } = await loadFixture(deploySavingBankFixture);

      const tenorDays = 7;
      const aprBps = 800;
      const minDeposit = ethers.parseUnits("100", 18);
      const maxDeposit = 0n; // unlimited
      const penaltyBps = 500;

      await expect(
        core
          .connect(owner)
          .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true)
      )
        .to.emit(core, "PlanCreated")
        .withArgs(
          1, // first plan id
          tenorDays,
          aprBps,
          minDeposit,
          maxDeposit,
          penaltyBps,
          true
        );

      const plan = await core.plans(1);
      expect(plan.id).to.equal(1n);
      expect(plan.tenorDays).to.equal(tenorDays);
      expect(plan.aprBps).to.equal(aprBps);
      expect(plan.minDeposit).to.equal(minDeposit);
      expect(plan.maxDeposit).to.equal(maxDeposit);
    });

    it("should fund and withdraw from vault correctly", async function () {
      const { owner, core, token } = await loadFixture(deploySavingBankFixture);

      const amount = ethers.parseUnits("1000", 18);
      const coreAddress = await core.getAddress();

      await token.connect(owner).approve(coreAddress, amount);

      await expect(core.connect(owner).fundVault(amount))
        .to.emit(core, "VaultFunded")
        .withArgs(owner.address, amount);

      expect(await core.vaultBalance()).to.equal(amount);

      await expect(core.connect(owner).withdrawVault(amount))
        .to.emit(core, "VaultWithdrawn")
        .withArgs(owner.address, amount);

      expect(await core.vaultBalance()).to.equal(0n);
    });
  });

  describe("User flows", function () {
    async function setupPlanAndVault() {
      const fixture = await loadFixture(deploySavingBankFixture);
      const { owner, user, core, token } = fixture;

      const tenorDays = 7;
      const aprBps = 800;
      const minDeposit = ethers.parseUnits("100", 18);
      const maxDeposit = 0n;
      const penaltyBps = 500;

      await core
        .connect(owner)
        .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true);

      // Fund vault with some amount to cover interest
      const vaultAmount = ethers.parseUnits("10000", 18);
      const coreAddress = await core.getAddress();
      await token.connect(owner).approve(coreAddress, vaultAmount);
      await core.connect(owner).fundVault(vaultAmount);

      return { ...fixture, tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps };
    }

    it("should open a deposit and mint NFT", async function () {
      const { user, core, certificate, token, minDeposit } = await setupPlanAndVault();

      await token.connect(user).approve(core.getAddress(), minDeposit);

      const tx = await core.connect(user).openDeposit(1, minDeposit);
      const receipt = await tx.wait();

      // DepositOpened event should be emitted with depositId = 1
      const events = receipt!.logs;
      expect(events.length).to.be.greaterThan(0);

      const activeId = await core.getMyActiveDepositId();
      expect(activeId).to.equal(1n);

      const dep = await core.deposits(activeId);
      expect(dep.owner).to.equal(user.address);
      expect(dep.principal).to.equal(minDeposit);

      const nftOwner = await certificate.ownerDepositCertificateOf(activeId);
      expect(nftOwner).to.equal(user.address);
    });

    it("should withdraw at maturity and pay correct interest", async function () {
      const { owner, user, core, certificate, token, tenorDays, aprBps, minDeposit } =
        await setupPlanAndVault();

      await token.connect(user).approve(core.getAddress(), minDeposit);
      await core.connect(user).openDeposit(1, minDeposit);

      const depositId = await core.getMyActiveDepositId();
      const dep = await core.deposits(depositId);

      // Move time to maturity
      await time.increaseTo(dep.maturityAt);

      const userBalanceBefore = await token.balanceOf(user.address);
      const vaultBefore = await core.vaultBalance();

      await expect(core.connect(user).withdrawAtMaturity(depositId))
        .to.emit(core, "Withdrawn")
        .withArgs(depositId, user.address, minDeposit, anyValue, false);

      const userBalanceAfter = await token.balanceOf(user.address);
      const vaultAfter = await core.vaultBalance();

      // User balance must increase, vaultBalance must decrease
      expect(userBalanceAfter).to.be.greaterThan(userBalanceBefore);
      expect(vaultAfter).to.be.lessThan(vaultBefore);

      // Deposit is no longer active
      const activeAfter = await core.getMyActiveDepositId();
      expect(activeAfter).to.equal(0n);

      // NFT burned
      await expect(certificate.ownerDepositCertificateOf(depositId)).to.be.reverted;
    });

    it("should early withdraw with penalty sent to feeReceiver", async function () {
      const { owner, user, core, token, minDeposit } = await setupPlanAndVault();

      await token.connect(user).approve(core.getAddress(), minDeposit);
      await core.connect(user).openDeposit(1, minDeposit);

      const depositId = await core.getMyActiveDepositId();
      const dep = await core.deposits(depositId);

      // Move time slightly forward but before maturity
      await time.increaseTo(dep.startAt + 1n);

      const ownerBalanceBefore = await token.balanceOf(owner.address);

      await expect(core.connect(user).earlyWithdraw(depositId))
        .to.emit(core, "Withdrawn")
        .withArgs(depositId, user.address, minDeposit, 0n, true);

      const ownerBalanceAfter = await token.balanceOf(owner.address);

      // Fee receiver (default owner) must have received some penalty
      expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);

      const activeAfter = await core.getMyActiveDepositId();
      expect(activeAfter).to.equal(0n);
    });

    it("should renew deposit at maturity into new plan", async function () {
      const { owner, user, core, token, minDeposit } = await setupPlanAndVault();

      await token.connect(user).approve(core.getAddress(), minDeposit);
      await core.connect(user).openDeposit(1, minDeposit);

      const depositId = await core.getMyActiveDepositId();
      const dep = await core.deposits(depositId);

      // Tạo plan mới
      const newTenorDays = 30;
      const newAprBps = 1000;
      const newMin = ethers.parseUnits("50", 18);
      const newMax = 0n;
      const newPenalty = 300;

      await core
        .connect(owner)
        .createPlan(newTenorDays, newAprBps, newMin, newMax, newPenalty, true);

      // Tua thời gian đến maturity của sổ cũ
      await time.increaseTo(dep.maturityAt);

      const tx = await core.connect(user).renewDeposit(depositId, 2);
      await tx.wait();

      const newActiveId = await core.getMyActiveDepositId();
      expect(newActiveId).to.equal(2n);

      const newDep = await core.deposits(newActiveId);
      expect(newDep.planId).to.equal(2n);
      expect(newDep.owner).to.equal(user.address);
      expect(newDep.principal).to.be.greaterThan(dep.principal); // principal + interest
    });
  });
});
