// scripts/create-sample-bank.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Creating sample bank using deployer:", deployer.address);

  // Lấy factory từ deployment
  const factoryAddr = (await hre.deployments.get("SavingBankUpgradeableFactory")).address;
  const factory = await ethers.getContractAt("SavingBankUpgradeableFactory", factoryAddr, deployer);

  // Token MockStablecoin
  const tokenAddr = (await hre.deployments.get("MockStablecoin")).address;

  // Tên và symbol cho NFT certificate
  const name = "SavingBank Certificate";
  const symbol = "SBC";

  console.log("Calling createSavingBank...");
  console.log(`- Token: ${tokenAddr}`);
  console.log(`- Name: ${name}`);
  console.log(`- Symbol: ${symbol}`);

  const tx = await factory.createSavingBank(tokenAddr, name, symbol);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Gas used:", receipt.gasUsed.toString());

  // Parse event SavingBankCreated
  const event = receipt.events?.find(e => e.event === "SavingBankCreated");
  if (event?.args) {
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