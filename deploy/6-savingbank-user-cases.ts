import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers, network } = hre;

  console.log("====================");
  console.log(network.name);
  console.log("====================");

  const factoryDeployment = await deployments.get("SavingBankUpgradeableFactory");
  const tokenDeployment = await deployments.get("MockStablecoin");

  const factory = await ethers.getContractAt(
    "SavingBankUpgradeableFactory",
    factoryDeployment.address
  );
  const token = await ethers.getContractAt(
    "MockStablecoin",
    tokenDeployment.address
  );

  const [deployer, user] = await ethers.getSigners();

  const total = await factory.allBanksLength();
  if (total === 0n) {
    console.log("No SavingBank instances found. Run SavingBankInstance deploy tag first.");
    return;
  }

  const lastIndex = total - 1n;
  const bankInfo = await factory.allBanks(lastIndex);
  const coreAddr = bankInfo.core;
  const registryAddr = bankInfo.registry;

  const bank = await ethers.getContractAt("SavingBankUpgradeable", coreAddr);
  const registry = await ethers.getContractAt("DepositRegistry", registryAddr);

  console.log("Using SavingBank core:", coreAddr);
  console.log("Using DepositRegistry:", registryAddr);

  // Ensure there is at least one active plan and funded vault (create if needed)
  const nextPlanId = await bank.nextPlanId();
  if (nextPlanId === 1n) {
    console.log("No plans yet, creating default plan...");
    const tenorDays = 30n;
    const aprBps = 500n; // 5%
    const minDeposit = ethers.parseUnits("100", 18);
    const maxDeposit = 0n; // unlimited
    const penaltyBps = 5000n; // 50%

    let tx = await bank
      .connect(deployer)
      .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true);
    await tx.wait();
  }

  const planId = 1n;

  const vaultBalance = await bank.vaultBalance();
  if (vaultBalance === 0n) {
    console.log("Vault empty, funding vault...");
    const fundAmount = ethers.parseUnits("10000", 18);
    let tx = await token.connect(deployer).mint(deployer.address, fundAmount);
    await tx.wait();
    tx = await token.connect(deployer).approve(await bank.getAddress(), fundAmount);
    await tx.wait();
    tx = await bank.connect(deployer).fundVault(fundAmount);
    await tx.wait();
  }

  // Mint tokens for user
  const userAmount = ethers.parseUnits("5000", 18);
  let tx = await token.connect(deployer).mint(user.address, userAmount);
  await tx.wait();
  console.log("User minted:", userAmount.toString());

  // Case 1: openDeposit
  const depositAmount = ethers.parseUnits("1000", 18);
  tx = await token.connect(user).approve(await bank.getAddress(), depositAmount);
  await tx.wait();

  tx = await bank.connect(user).openDeposit(planId, depositAmount);
  await tx.wait();
  console.log("User opened deposit.");

  let activeId = await bank.connect(user).getMyActiveDepositId();
  console.log("Active deposit id:", activeId.toString());

  // Case 2: earlyWithdraw before maturity
  const dep = await registry.deposits(activeId);
  const now = await ethers.provider.getBlock("latest");
  const maturity = Number(dep.maturityAt);
  const currentTs = now?.timestamp ?? Math.floor(Date.now() / 1000);

  if (network.name === "hardhat" && maturity - currentTs > 60) {
    console.log("Doing earlyWithdraw scenario before maturity...");
    tx = await bank.connect(user).earlyWithdraw(activeId);
    await tx.wait();
    console.log("User earlyWithdraw completed.");
  } else {
    console.log("Skipping earlyWithdraw scenario (non-hardhat or already near maturity).");
  }

  // Re-open a new deposit for maturity / renew scenario
  tx = await token.connect(user).approve(await bank.getAddress(), depositAmount);
  await tx.wait();
  tx = await bank.connect(user).openDeposit(planId, depositAmount);
  await tx.wait();
  activeId = await bank.connect(user).getMyActiveDepositId();
  console.log("New active deposit id:", activeId.toString());

  const dep2 = await registry.deposits(activeId);
  const now2 = await ethers.provider.getBlock("latest");
  const maturity2 = Number(dep2.maturityAt);
  const currentTs2 = now2?.timestamp ?? Math.floor(Date.now() / 1000);
  const delta = maturity2 - currentTs2 + 1;

  if (network.name === "hardhat") {
    await network.provider.send("evm_increaseTime", [delta]);
    await network.provider.send("evm_mine", []);

    // Case 3: withdrawAtMaturity
    tx = await bank.connect(user).withdrawAtMaturity(activeId);
    await tx.wait();
    console.log("User withdrawAtMaturity completed.");

    // Case 4: open again and renewDeposit
    tx = await token.connect(user).approve(await bank.getAddress(), depositAmount);
    await tx.wait();
    tx = await bank.connect(user).openDeposit(planId, depositAmount);
    await tx.wait();
    activeId = await bank.connect(user).getMyActiveDepositId();
    console.log("Renew scenario deposit id:", activeId.toString());

    const dep3 = await registry.deposits(activeId);
    const now3 = await ethers.provider.getBlock("latest");
    const maturity3 = Number(dep3.maturityAt);
    const currentTs3 = now3?.timestamp ?? Math.floor(Date.now() / 1000);
    const delta2 = maturity3 - currentTs3 + 1;

    await network.provider.send("evm_increaseTime", [delta2]);
    await network.provider.send("evm_mine", []);

    tx = await bank.connect(user).renewDeposit(activeId, planId);
    await tx.wait();
    const newId = await bank.connect(user).getMyActiveDepositId();
    console.log("User renewDeposit completed, new id:", newId.toString());
  } else {
    console.log("Skipping time-travel scenarios (withdrawAtMaturity/renew) on non-hardhat network.");
  }

  console.log("=== User scenario script completed ===");
};

func.tags = ["SavingBankUserCases"];
func.dependencies = ["SavingBankInstance"];
export default func;
