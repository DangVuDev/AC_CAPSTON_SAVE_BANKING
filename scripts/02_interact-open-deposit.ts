import { ethers } from "hardhat";

async function main() {
  const [user] = await ethers.getSigners();
  console.log("User address:", user.address);

  // BANK address must be provided via env var `BANK_ADDRESS`
  const BANK_ADDRESS = process.env.BANK_ADDRESS;
  if (!BANK_ADDRESS) {
    throw new Error('Set BANK_ADDRESS in environment before running this script');
  }

  const bank = await ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS, user);

  const planId = 1n;
  const amount = ethers.parseUnits("100", 6);

  const tokenAddr = await bank.token();
  const token = await ethers.getContractAt("MockStablecoin", tokenAddr, user);

  // Mint thêm token cho user (để chắc chắn)
  const mintAmount = ethers.parseUnits("10000", 6);
  console.log("Minting 10,000 USDC to user...");
  const mintTx = await token.mint(user.address, mintAmount);
  await mintTx.wait();
  console.log("Minted done!");

  const balance = await token.balanceOf(user.address);
  console.log("User balance after mint:", ethers.formatUnits(balance, 6), "USDC");

  console.log("Approving infinite for SavingBank...");
  const infinite = ethers.MaxUint256;
  const approveTx = await token.approve(BANK_ADDRESS, infinite);
  await approveTx.wait();
  console.log("Infinite approved!");

  const allowance = await token.allowance(user.address, BANK_ADDRESS);
  console.log("Allowance after approve:", ethers.formatUnits(allowance, 6), "USDC");

  console.log("Calling openDeposit...");
  const tx = await bank.openDeposit(planId, amount);
  console.log("Tx hash:", tx.hash);

  const receipt = await tx.wait();

  const event = receipt?.logs
    .map(log => bank.interface.parseLog(log))
    .find(e => e?.name === "DepositOpened");

  if (event) {
    console.log("Deposit ID:", event.args.depositId.toString());
  } else {
    console.log("Không tìm thấy event DepositOpened");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});