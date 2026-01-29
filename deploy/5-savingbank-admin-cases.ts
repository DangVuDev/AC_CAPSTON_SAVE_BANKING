import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;

  console.log("====================");
  console.log(hre.network.name);
  console.log("====================");


  const factoryDeployment = await deployments.get("SavingBankUpgradeableFactory");
  const tokenDeployment = await deployments.get("MockStablecoin");

  console.log("Factory address:", factoryDeployment.address);
  console.log("MockStablecoin address:", tokenDeployment.address);

  const factory = await ethers.getContractAt(
    "SavingBankUpgradeableFactory",
    factoryDeployment.address
  );
  const token = await ethers.getContractAt(
    "MockStablecoin",
    tokenDeployment.address
  );

  const [deployer] = await ethers.getSigners();

  const total = await factory.allBanksLength();
  if (total === 0n) {
    console.log("No SavingBank instances found. Run SavingBankInstance deploy tag first.");
    return;
  }

  const lastIndex = total - 1n;
  const bankInfo = await factory.allBanks(lastIndex);
  const coreAddr = bankInfo.core;
  const registryAddr = bankInfo.registry;
  const certAddr = bankInfo.certificate;

  console.log("SavingBank core address:", coreAddr);
  console.log("DepositRegistry address:", registryAddr);
  console.log("DepositCertificate address:", certAddr);

  const bank = await ethers.getContractAt("SavingBankUpgradeable", coreAddr);

  // Admin: createPlan
  const tenorDays = 60n;
  const aprBps = 300n; // 3%
  const minDeposit = ethers.parseUnits("50", 18);
  const maxDeposit = ethers.parseUnits("10000", 18);
  const penaltyBps = 2000n; // 20%

  const nextIdBefore = await bank.nextPlanId();
  console.log("Creating plan id:", nextIdBefore.toString());

  let tx = await bank
    .connect(deployer)
    .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true);
  await tx.wait();

  console.log("Plan created.");

  // Admin: updatePlan
  tx = await bank
    .connect(deployer)
    .updatePlan(nextIdBefore, tenorDays, aprBps + 100n, minDeposit, maxDeposit, penaltyBps, false);
  await tx.wait();

  console.log("Plan updated (APR +1%, disabled).");

  // Admin: setFeeReceiver
  tx = await bank.connect(deployer).setFeeReceiver(deployer.address);
  await tx.wait();
  console.log("Fee receiver set to:", deployer.address);


  // Admin: fundVault
  const fundAmount = ethers.parseUnits("1000", 18);
  const deployerBalance = await token.balanceOf(deployer.address);
  console.log("Deployer mUSD balance before mint:", deployerBalance.toString());
  if (deployerBalance < fundAmount) {
    const mintAmount = fundAmount - deployerBalance;
    console.log("Minting mUSD for deployer:", mintAmount.toString());
    tx = await token.connect(deployer).mint(deployer.address, mintAmount);
    await tx.wait();
  }
  const afterMintBalance = await token.balanceOf(deployer.address);
  console.log("Deployer mUSD balance after mint:", afterMintBalance.toString());

  tx = await token.connect(deployer).approve(await bank.getAddress(), fundAmount);
  await tx.wait();

  tx = await bank.connect(deployer).fundVault(fundAmount);
  await tx.wait();
  console.log("Vault funded with:", fundAmount.toString());

  // Admin: withdrawVault
  const withdrawAmount = ethers.parseUnits("500", 18);
  tx = await bank.connect(deployer).withdrawVault(withdrawAmount);
  await tx.wait();
  console.log("Vault withdrawn:", withdrawAmount.toString());

  // Admin: pause / unpause
  tx = await bank.connect(deployer).pause();
  await tx.wait();
  console.log("Bank paused.");

  tx = await bank.connect(deployer).unpause();
  await tx.wait();
  console.log("Bank unpaused.");

  console.log("=== Admin scenario script completed ===");
};

func.tags = ["SavingBankAdminCases"];
func.dependencies = ["SavingBankInstance"];
export default func;
