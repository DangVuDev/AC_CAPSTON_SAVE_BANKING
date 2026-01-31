import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  const BANK_ADDRESS = process.env.BANK_ADDRESS;
  if (!BANK_ADDRESS) throw new Error('Set BANK_ADDRESS in environment before running this script');

  const bank = await ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS, user);

  const depositId = 1n; // Thay bằng ID thật từ log open-deposit

  console.log("Calling withdrawAtMaturity...");
  const tx = await bank.withdrawAtMaturity(depositId);
  console.log("Tx hash:", tx.hash);

  await tx.wait();
  console.log("Withdrawn at maturity!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});