import hre from "hardhat";

async function main() {
  const [caller] = await hre.ethers.getSigners();
  console.log("Caller:", caller.address);

  // Resolve bank address: prefer env, otherwise try to read from deployments + factory
  let BANK_ADDRESS = process.env.BANK_ADDRESS;
  if (!BANK_ADDRESS) {
    console.log("Env BANK_ADDRESS not set; attempting to read from deployments/factory for the current signer...");
    const deployments = await hre.deployments.all();
    const factoryAddr = deployments.SavingBankUpgradeableFactory?.address;
    if (factoryAddr) {
      const factory = await hre.ethers.getContractAt("SavingBankUpgradeableFactory", factoryAddr);
      try {
        const userBanks = await factory.getUserBanks(caller.address);
        if (userBanks && userBanks.length > 0) {
          BANK_ADDRESS = userBanks[0];
          console.log("Using first bank from factory for caller:", BANK_ADDRESS);
        }
      } catch (e) {
        // ignore
      }
    }
  }

  if (!BANK_ADDRESS) {
    console.error("BANK_ADDRESS not provided and none found in deployments. Set env BANK_ADDRESS or deploy a bank first.");
    process.exit(1);
  }

  const bank = await hre.ethers.getContractAt("SavingBankUpgradeable", BANK_ADDRESS);

  console.log("\n=== Basic Bank Info ===");
  console.log("Bank address:", BANK_ADDRESS);
  const tokenAddr = await bank.token();
  console.log("Token:", tokenAddr);
  const registryAddr = await bank.registry();
  console.log("Registry:", registryAddr);
  const certAddr = await bank.certificate();
  console.log("Certificate (ERC721):", certAddr);
  const feeReceiver = await bank.getFeeReceiver();
  console.log("Fee receiver:", feeReceiver);

  // Vault info
  let vaultAddr: string | undefined;
  try {
    vaultAddr = await bank.vault();
  } catch (err) {
    // If the public variable getter isn't available in ABI, try reading from events or from deployments
    console.warn("Could not read `vault()` directly from bank; skipping vault address retrieval.");
  }

  const bankVaultBalance = await bank.getVaultBalance();
  console.log("Bank reported vault balance:", bankVaultBalance.toString());

  if (vaultAddr) {
    const vault = await hre.ethers.getContractAt("Vault", vaultAddr);
    const vBal = await vault.getVaultBalance();
    console.log("Vault address:", vaultAddr);
    console.log("Vault.getVaultBalance():", vBal.toString());
    const vaultToken = await vault.getToken();
    console.log("Vault token:", vaultToken);
    const vaultSavingBank = await vault.getSavingBank();
    console.log("Vault savingBank():", vaultSavingBank);
  }

  // Plans: iterate plans from 1 .. nextPlanId-1
  console.log("\n=== Plans ===");
  const nextPlanIdBN = await bank.nextPlanId();
  const nextPlanId = Number(nextPlanIdBN);
  console.log("nextPlanId:", nextPlanId);
  if (nextPlanId <= 1) {
    console.log("No plans created yet.");
  } else {
    for (let i = 1; i < nextPlanId; i++) {
      try {
        const plan = await bank.plans(i);
        console.log(`Plan ${i}: tenorDays=${plan.tenorDays.toString()}, aprBps=${plan.aprBps.toString()}, min=${plan.minDeposit.toString()}, max=${plan.maxDeposit.toString()}, penaltyBps=${plan.earlyWithdrawPenaltyBps.toString()}, enabled=${plan.enabled}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Could not read plan ${i}:`, msg);
      }
    }
  }

  // Optional: get deposit info when DEPOSIT_ID provided
  const depositIdEnv = process.env.DEPOSIT_ID;
  if (depositIdEnv) {
    try {
      const registry = await hre.ethers.getContractAt("DepositRegistry", registryAddr);
      const depositId = Number(depositIdEnv);
      const dep = await registry.deposits(depositId);
      console.log("\n=== Deposit Info ===");
      console.log(dep);
    } catch (e) {
      console.warn("Failed to read deposit:", e instanceof Error ? e.message : String(e));
    }
  }

  // Optional: list active deposits of caller
  try {
    const registry = await hre.ethers.getContractAt("DepositRegistry", registryAddr);
    const active = await registry.getActiveDepositId(caller.address);
    console.log("\nActive deposit IDs for caller:", active.map((id: any) => id.toString()));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Could not fetch active deposits:", msg);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
