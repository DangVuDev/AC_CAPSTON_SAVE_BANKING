import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("====================");
  console.log("Network:", hre.network.name);
  console.log("====================");

  console.log("====================");
  console.log("Deploying SavingBankUpgradeableFactory...");
  console.log("====================");

  const result = await deploy("SavingBankUpgradeableFactory", {
    contract: "SavingBankUpgradeableFactory",
    from: deployer,
    args: [],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: false,
  });
  console.log("SavingBankUpgradeableFactory deployed at:", result.address);
};

func.tags = ["SavingBankFactory"];
export default func;
