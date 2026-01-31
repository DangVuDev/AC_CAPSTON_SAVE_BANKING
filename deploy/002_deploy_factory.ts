import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("====================");
  log(`Network: ${hre.network.name}`);
  log(`Deployer: ${deployer}`);
  log("====================");

  log("Deploying SavingBankUpgradeableFactory...");
  const result = await deploy("SavingBankUpgradeableFactory", {
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: true,
  });

  log(`SavingBankUpgradeableFactory deployed at: ${result.address}`);

};

func.tags = ["Factory"];
export default func;