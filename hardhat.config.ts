import { task } from "hardhat/config";
import "@openzeppelin/hardhat-upgrades";
// Load Etherscan verification plugin only when an API key is provided
if (process.env.ETHERSCAN_API && process.env.ETHERSCAN_API !== "") {
  try {
    require("@nomicfoundation/hardhat-verify");
  } catch (e) {
    console.warn("hardhat-verify plugin not available:", e);
  }
}
import "hardhat-contract-sizer";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "@nomicfoundation/hardhat-ethers";
// TypeChain plugin can be heavy on some Windows Node builds and cause libuv asserts.
// Load it conditionally so we can disable with DISABLE_TYPECHAIN=1 in the environment.
if (process.env.DISABLE_TYPECHAIN !== "1") {
  try {
    require("@typechain/hardhat");
  } catch (e) {
    // If the plugin is not installed or fails to load, fail gracefully and continue.
    console.warn("@typechain/hardhat not loaded:", e );
  }
}

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const {
  TESTNET_PRIVATE_KEY: testnetPrivateKey,
  MAINNET_PRIVATE_KEY: mainnetPrivateKey,
  ETHERSCAN_API: etherAPI,

} = process.env;
const reportGas = process.env.REPORT_GAS;

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  networks: {
    "sepolia": {
      url: "https://1rpc.io/sepolia",
      chainId: 11155111,
      accounts: [testnetPrivateKey],
      timeout: 40000,
    },
    "ethereum": {
      url: "https://eth-mainnet.public.blastapi.io",
      chainId: 1,
      accounts: [mainnetPrivateKey],
      timeout: 60000,
    }
  },
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,          // Giảm runs xuống để ưu tiên size thay vì gas runtime
      },
      viaIR: true,          // BẬT DÒNG NÀY – giảm size cực mạnh (thường dưới 20KB)
      metadata: {
        bytecodeHash: "none", // Giảm thêm size metadata
      },
    },
  },
  abiExporter: {
    path: "data/abi",
    runOnCompile: false,
    clear: true,
    flat: false,
    only: [],
    spacing: 4,
  },
  gasReporter: {
    enabled: reportGas == "1",
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,
  },
  etherscan: {
    // Etherscan V2 expects a single API key string. Read from env `ETHERSCAN_API`.
    apiKey: process.env.ETHERSCAN_API || "",
  },
  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: false,
  },
  mocha: {
    timeout: 40000,
  },
  namedAccounts: {
    deployer: 0,
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};
