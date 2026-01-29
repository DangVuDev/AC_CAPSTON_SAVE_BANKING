# SavingBank v2 — Time-Locked NFT Savings (Capstone)

[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/) [![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.24-blue.svg)](https://soliditylang.org/) [![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-Contracts-green.svg)](https://openzeppelin.com/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Author: DangVuDev

Project: Educational capstone with a production-minded, upgradable SavingBank core and separate state holder + NFT certificates.

---

## Table of contents

- Overview
- Quick Start
- Architecture (short)
- Usage & Deploy
- Testing
- Troubleshooting
- Docs

---

## Overview

SavingBank v2 implements time-locked savings where each deposit is represented by an ERC721 NFT certificate and the core logic is upgradable while deposit state remains stable in a separate registry.

Design goals:

- Keep deposit state stable and auditable (non-upgradable registry)
- Allow safe upgrades of core business logic (proxy + upgradable core)
- Provide clear admin/user flows and easy testability

---

## Quick start

Clone, install dependencies and compile:

```bash
git clone <this-repo-url>
cd AC_CAPSTON_SAVE_BANKING/ac-hardhat-template
npm install
npx hardhat compile
```

Run tests:

```bash
npx hardhat test
```

Run local deploy (Hardhat network):

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Deploy to Sepolia (ensure `.env` configured with `SEPOLIA_RPC_URL` and `PRIVATE_KEY`):

```bash
npx hardhat deploy --network sepolia
```

---

## Architecture (short)

Core components:

- `SavingBankCoreUpgradeable` — upgradable core (plans, vault, open/withdraw/renew logic)
- `DepositRegistry` — non-upgradable state holder for deposits
- `DepositCertificateUpgradeable` — ERC721 certificate (tokenId == depositId)
- `SavingBankUpgradeableFactory` — deploys wired instances per ERC20

For details see [docs/PLAN.md](docs/PLAN.md).

---

## Usage & common commands

Interactive console example:

```bash
npx hardhat console --network sepolia
# in console (example)
const [deployer] = await ethers.getSigners()
const factory = await ethers.getContractAt('SavingBankUpgradeableFactory', '<factory-address>')
const total = await factory.allBanksLength()
```

Deploy & run scenario scripts (examples):

```bash
npx hardhat deploy --tags MockStablecoin --network sepolia
npx hardhat deploy --tags SavingBankFactory --network sepolia
npx hardhat deploy --tags SavingBankInstance --network sepolia
npx hardhat deploy --tags SavingBankAdminCases --network sepolia
npx hardhat deploy --tags SavingBankUserCases --network sepolia
```

Notes:

- Ensure the deployer account has enough token balance (admin scripts may mint tokens for testing) and ETH for gas.
- If RPC provider is unreliable, switch `SEPOLIA_RPC_URL` in `.env` to a stable provider (Alchemy/Infura).

---

## Testing

Run full test suite:

```bash
npx hardhat test
```

Run a specific test file:

```bash
npx hardhat test test/SavingBankUpgradeable.test.ts
```

---

## Troubleshooting

- Provider RPC errors: switch RPC URL in `.env` (Alchemy/Infura) or retry.
- Deploy reverts: inspect transaction logs and ensure the deployer has token approvals and sufficient balances.
- If scenario scripts fail at `fundVault`, ensure the deployer has tokens or allow minting in `MockStablecoin`.

---

## Docs

- Use cases: [docs/USECASE.md](docs/USECASE.md)
- Architecture & plan: [docs/PLAN.md](docs/PLAN.md)
- Function logic & security: [docs/LOGIC_FUNCTION.md](docs/LOGIC_FUNCTION.md)

---

## Contributing

1. Fork the repo
2. Create a branch for your feature
3. Add tests for new behavior
4. Open a PR with a clear description

---

## License

MIT
