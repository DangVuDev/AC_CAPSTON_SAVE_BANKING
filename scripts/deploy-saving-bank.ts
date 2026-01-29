import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Deploy mock stablecoin (ERC20) dùng làm underlying token
  const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
  const mockStablecoin = await MockStablecoin.deploy("Mock USD", "mUSD", 18);
  await mockStablecoin.waitForDeployment();
  const mockAddress = await mockStablecoin.getAddress();
  console.log("MockStablecoin deployed at:", mockAddress);

  // Mint một ít token cho deployer để test gửi tiết kiệm
  const mintAmount = ethers.parseUnits("1000000", 18); // 1,000,000 mUSD
  const mintTx = await mockStablecoin.mint(deployer.address, mintAmount);
  await mintTx.wait();
  console.log("Minted", mintAmount.toString(), "tokens to deployer");

  // 2. Deploy SavingBankUpgradeableFactory
  const Factory = await ethers.getContractFactory("SavingBankUpgradeableFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("SavingBankUpgradeableFactory deployed at:", factoryAddress);

  // 3. Dùng factory tạo một SavingBank core + DepositCertificate cho mock stablecoin
  const name = "Mock Saving Certificate";
  const symbol = "MSC";

  // callStatic để lấy trước địa chỉ core & certificate sẽ được tạo
  const [coreAddr, certAddr] = await factory.createSavingBank.staticCall(
    mockAddress,
    name,
    symbol
  );

  const createTx = await factory.createSavingBank(mockAddress, name, symbol);
  await createTx.wait();

  console.log("SavingBank core deployed at:", coreAddr);
  console.log("DepositCertificate deployed at:", certAddr);

  // 4. Khởi tạo 1 saving plan cơ bản và fund vault để phục vụ test nghiệp vụ
  const bank = await ethers.getContractAt("SavingBankUpgradeable", coreAddr);

  // Ví dụ: kỳ hạn 30 ngày, APR 5% (500 bps), min 100 mUSD, không giới hạn max, penalty 50% lãi khi rút sớm
  const tenorDays = 30;
  const aprBps = 500; // 5%
  const minDeposit = ethers.parseUnits("100", 18);
  const maxDeposit = 0; // 0 = không giới hạn
  const earlyWithdrawPenaltyBps = 5000; // 50% lãi

  const createPlanTx = await bank.createPlan(
    tenorDays,
    aprBps,
    minDeposit,
    maxDeposit,
    earlyWithdrawPenaltyBps,
    true
  );
  await createPlanTx.wait();
  console.log("Created saving plan id = 1");

  // Fund vault 10,000 mUSD để trả lãi cho các sổ
  const vaultFund = ethers.parseUnits("10000", 18);
  const approveTx = await mockStablecoin.approve(coreAddr, vaultFund);
  await approveTx.wait();
  const fundVaultTx = await bank.fundVault(vaultFund);
  await fundVaultTx.wait();
  console.log("Vault funded with:", vaultFund.toString(), "mUSD");

  console.log("=== Deploy test completed successfully ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
