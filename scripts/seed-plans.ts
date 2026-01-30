// scripts/seed-plans.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  const bankAddr = "0x..."; // SavingBank address
  const bank = await ethers.getContractAt("SavingBankUpgradeable", bankAddr, owner);

  console.log("Seeding plans as owner:", owner.address);

  // Plan 1: 30 ngày, 5%
  await bank.createPlan(30, 500, ethers.utils.parseUnits("100", 6), 0, 1000, true);
  console.log("Plan 1 created");

  // Plan 2: 90 ngày, 7%
  await bank.createPlan(90, 700, ethers.utils.parseUnits("500", 6), ethers.utils.parseUnits("10000", 6), 1500, true);
  console.log("Plan 2 created");
}

main().catch(console.error);