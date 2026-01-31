import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  const BANK_ADDRESS = process.env.BANK_ADDRESS;
  if (!BANK_ADDRESS) throw new Error('Set BANK_ADDRESS in environment before running this script');

  const bank = await ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS, user);

  const depositId = 1n;
  const newPlanId = 2n;

  console.log("Calling renewDeposit...");
  const tx = await bank.renewDeposit(depositId, newPlanId);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();

  const event = receipt?.logs
    .map(log => bank.interface.parseLog(log))
    .find(e => e?.name === "Renewed");

  if (event) {
    console.log("New Deposit ID:", event.args.newDepositId.toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});