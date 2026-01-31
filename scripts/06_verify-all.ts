import hre from "hardhat";

async function main() {
  const chainId = await hre.ethers.provider.getNetwork().then(n => Number(n.chainId));
  console.log("Current chainId:", chainId);

  if (chainId === 31337 || chainId === 1337) {
    console.log("Verify skipped: localhost or hardhat node (chainId 31337/1337) không hỗ trợ verify.");
    console.log("Chỉ verify trên testnet/mainnet (sepolia, mainnet, etc.)");
    return;
  }

  const deployments = await hre.deployments.all();
  const entries = Object.values(deployments).filter(Boolean) as Array<any>;

  console.log(`Found ${entries.length} contracts to verify`);

  if (process.env.SKIP_VERIFY === "1") {
    console.log("SKIP_VERIFY=1 set — skipping on-chain verification.");
    return;
  }

  if (!process.env.ETHERSCAN_API || process.env.ETHERSCAN_API === "") {
    console.log("No ETHERSCAN_API configured — skipping verification.");
    return;
  }

  for (const dep of entries) {
    try {
      const addr = dep.address;
      const constructorArguments = dep.args || [];
      console.log(`Verifying ${addr}...`);
      await hre.run("verify:verify", { address: addr, constructorArguments });
      console.log(`Verified: ${addr}`);
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err);
      if (msg.includes("Already Verified")) {
        console.log(`Already verified: ${dep.address}`);
      } else {
        console.error(`Verify failed for ${dep.address}:`, msg);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});