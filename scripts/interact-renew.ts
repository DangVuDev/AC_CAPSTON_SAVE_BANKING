// scripts/interact-renew.ts
import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  const bankAddr = "0x...";
  const bank = await ethers.getContractAt("SavingBankUpgradeable", bankAddr, user);

  const depositId = 1n;
  const newPlanId = 2; // plan mới

  console.log("Calling renewDeposit...");
  const tx = await bank.renewDeposit(depositId, newPlanId);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  const event = receipt.events?.find(e => e.event === "Renewed");
  if (event?.args) {
    console.log("New Deposit ID:", event.args.newDepositId.toString());
  }
}

main().catch(console.error);