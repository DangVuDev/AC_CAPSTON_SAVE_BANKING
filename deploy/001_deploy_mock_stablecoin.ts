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

  log("Deploying MockStablecoin...");
  const result = await deploy("MockStablecoin", {
    from: deployer,
    args: ["Mock USD", "mUSD", 6], // 6 decimals như USDC
    log: true,
    autoMine: true, // cho local nhanh hơn
    skipIfAlreadyDeployed: true, // tránh deploy lại nếu đã có
  });

  log(`MockStablecoin deployed at: ${result.address}`);

  
};

func.tags = ["MockStablecoin"];
export default func;