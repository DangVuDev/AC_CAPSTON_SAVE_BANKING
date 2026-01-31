import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  const BANK_ADDRESS = process.env.BANK_ADDRESS;
  if (!BANK_ADDRESS) throw new Error('Set BANK_ADDRESS in environment before running this script');

  const bank = await ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS, user);

  const depositId = 1n;

  console.log("Calling earlyWithdraw...");
  const tx = await bank.earlyWithdraw(depositId);
  console.log("Tx hash:", tx.hash);

  await tx.wait();
  console.log("Early withdrawn!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});