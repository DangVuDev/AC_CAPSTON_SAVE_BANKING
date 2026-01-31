import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Creating sample bank with deployer:", deployer.address);

  // Token address can be provided via env `TOKEN_ADDRESS`. If not present, try to read from deployments.
  let TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
  if (!TOKEN_ADDRESS) {
    console.log('TOKEN_ADDRESS not set in env; attempting to read from deployments');

    const deployments = await hre.deployments.all();
    TOKEN_ADDRESS = deployments.MockStablecoin?.address;
  }
  if (!TOKEN_ADDRESS) {
    console.error('TOKEN_ADDRESS is required. Set env TOKEN_ADDRESS or deploy MockStablecoin first.');
    process.exit(1);
  }
  const deployments = await hre.deployments.all();
  // <<<=== DÁN FACTORY ADDRESS VÀO ĐÂY (nếu cần, hoặc dùng từ deployments) ===>>>
  let factoryAddr = deployments.SavingBankUpgradeableFactory?.address;

  if (!factoryAddr) {
    console.error("Factory not deployed yet. Run deploy --tags Factory first.");
    process.exit(1);
  }

  console.log("Factory address:", factoryAddr);
  console.log("Token address (manual input):", TOKEN_ADDRESS);

  const factory = await hre.ethers.getContractAt("SavingBankUpgradeableFactory", factoryAddr);

  const name = "SavingBank Certificate";
  const symbol = "SBC";

  console.log("Calling createSavingBank...");
  const tx = await factory.createSavingBank(TOKEN_ADDRESS, name, symbol);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Gas used:", receipt?.gasUsed.toString());

  const event = receipt?.logs
    .map(log => factory.interface.parseLog(log))
    .find(e => e?.name === "SavingBankCreated");

  if (event) {
    console.log("Sample bank created:");
    console.log(`- SavingBank: ${event.args.bank}`);
    console.log(`- Registry: ${event.args.registry}`);
    console.log(`- Certificate: ${event.args.certificate}`);
    console.log(`- Token: ${event.args.token}`);
  } else {
    console.log("Không tìm thấy event SavingBankCreated");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});