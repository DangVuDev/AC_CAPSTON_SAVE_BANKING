// scripts/interact-withdraw-maturity.ts
import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  const bankAddr = "0x..."; // SavingBank address
  const bank = await ethers.getContractAt("SavingBankUpgradeable", bankAddr, user);

  const depositId = 1n; // ID sổ đã mở và đáo hạn

  console.log("Calling withdrawAtMaturity...");
  const tx = await bank.withdrawAtMaturity(depositId);
  console.log("Tx hash:", tx.hash);

  await tx.wait();
  console.log("Withdraw completed!");
}

main().catch(console.error);