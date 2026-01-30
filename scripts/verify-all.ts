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
  const addresses = Object.values(deployments).map(d => d.address).filter(Boolean);

  console.log(`Found ${addresses.length} contracts to verify`);

  for (const addr of addresses) {
    try {
      console.log(`Verifying ${addr}...`);
      await hre.run("verify:verify", { address: addr });
      console.log(`Verified: ${addr}`);
    } catch (err: any) {
      if (err.message.includes("Already Verified")) {
        console.log(`Already verified: ${addr}`);
      } else {
        console.error(`Verify failed for ${addr}:`, err.message);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});