import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  // <<<=== DÁN BANK ADDRESS VÀO ĐÂY ===>>>
  const BANK_ADDRESS = "0xEBb2863137Dff7e96886090D303373E8Ec9CF5B8";
  // <<<====================================>>>

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