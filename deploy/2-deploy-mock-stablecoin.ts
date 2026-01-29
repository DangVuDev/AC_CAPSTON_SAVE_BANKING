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
  console.log("Deploying MockStablecoin...");
  console.log("====================");

  const result = await deploy("MockStablecoin", {
    contract: "MockStablecoin",
    from: deployer,
    args: ["Mock USD", "mUSD", 18],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: false,
  });
  console.log("MockStablecoin deployed at:", result.address);
};

func.tags = ["MockStablecoin"];
export default func;
