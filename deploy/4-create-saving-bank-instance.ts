import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();

  console.log("====================");
  console.log(hre.network.name);
  console.log("====================");

  const mock = await deployments.get("MockStablecoin");
  const factoryDeployment = await deployments.get("SavingBankUpgradeableFactory");

  const factory = await ethers.getContractAt(
    "SavingBankUpgradeableFactory",
    factoryDeployment.address
  );

  console.log("Using MockStablecoin:", mock.address);
  console.log("Using SavingBankUpgradeableFactory:", factoryDeployment.address);

  const name = "Mock Saving Certificate";
  const symbol = "MSC";

  // Lấy trước địa chỉ core, registry & certificate sẽ được tạo
  const [coreAddr, registryAddr, certAddr] =
    await factory.createSavingBank.staticCall(mock.address, name, symbol);

  const tx = await factory
    .connect((await ethers.getSigners())[0])
    .createSavingBank(mock.address, name, symbol);
  await tx.wait();

  console.log("SavingBank core deployed at:", coreAddr);
  console.log("DepositRegistry deployed at:", registryAddr);
  console.log("DepositCertificate deployed at:", certAddr);

  // (Tuỳ chọn) in ra số lượng bank đã tạo
  const total = await factory.allBanksLength();
  console.log("Total banks created:", total.toString());
};

func.tags = ["SavingBankInstance"];
func.dependencies = ["MockStablecoin", "SavingBankFactory"];
export default func;
