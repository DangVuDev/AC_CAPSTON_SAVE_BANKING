// scripts/verify-all.ts
import { HardhatRuntimeEnvironment } from "hardhat/types";

async function main(hre: HardhatRuntimeEnvironment) {
  const deployments = await hre.deployments.getDeploymentsFromDisk();
  const addresses = Object.values(deployments)
    .map(d => d.address)
    .filter(addr => addr !== undefined && addr !== "0x0000000000000000000000000000000000000000");

  console.log(`Found ${addresses.length} contracts to verify`);

  for (const addr of addresses) {
    try {
      console.log(`Verifying contract at ${addr}...`);
      await hre.run("verify:verify", {
        address: addr,
        // Nếu contract có constructor args, thêm vào đây (tùy contract)
        // constructorArguments: [...],
      });
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

export default function(hre: HardhatRuntimeEnvironment) {
  main(hre).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}