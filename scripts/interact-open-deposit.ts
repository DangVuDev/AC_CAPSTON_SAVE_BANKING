// scripts/interact-open-deposit.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  // Lấy SavingBank address (giả sử đã deploy 1 bank)
  const bankAddr = "0x..."; // thay bằng address SavingBank thật
  const bank = await ethers.getContractAt("SavingBankUpgradeable", bankAddr, user);

  const planId = 1; // plan đã seed
  const amount = ethers.utils.parseUnits("100", 6); // 100 USDC

  const tokenAddr = await bank.token();
  const token = await ethers.getContractAt("MockStablecoin", tokenAddr, user);

  console.log("Approving token...");
  const approveTx = await token.approve(bankAddr, amount);
  await approveTx.wait();
  console.log("Approved!");

  console.log("Calling openDeposit...");
  const tx = await bank.openDeposit(planId, amount);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();
  const event = receipt.events?.find(e => e.event === "DepositOpened");
  if (event?.args) {
    console.log("Deposit ID:", event.args.depositId.toString());
  }
}

main().catch(console.error);