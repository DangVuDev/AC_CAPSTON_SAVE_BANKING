import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Seeding plans as owner:", owner.address);

  const BANK_ADDRESS = "0xEBb2863137Dff7e96886090D303373E8Ec9CF5B8";

  const bank = await ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS, owner);

  await bank.createPlan(30, 500, ethers.parseUnits("100", 6), 0n, 1000, true);
  console.log("Plan 1 created (30 days, 5%)");

  await bank.createPlan(90, 700, ethers.parseUnits("500", 6), ethers.parseUnits("10000", 6), 1500, true);
  console.log("Plan 2 created (90 days, 7%)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});