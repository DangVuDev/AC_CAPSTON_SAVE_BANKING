# AC Capstone - SavingBank (Time-Locked Savings with NFT Certificates)

[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-blue.svg)](https://soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-Contracts-green.svg)](https://openzeppelin.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)


**Author:** DangVuDev
**Project Type:** Educational Capstone & Production-Ready Savings Product

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Core Smart Contracts](#core-smart-contracts)
- [User Flows](#user-flows)
- [Admin Flows](#admin-flows)
- [Interest & Penalty Model](#interest--penalty-model)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage (Hardhat)](#usage-hardhat)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Security Considerations](#security-considerations)
- [Future Improvements](#future-improvements)
- [License](#license)

---

## Overview

This project implements a time-locked savings product ("SavingBank") using an ERC20 token as the underlying asset.  
Each savings deposit is represented as an ERC721 NFT certificate, giving users non-fungible proof of their time-locked position.

The goal of this capstone is to:

- Demonstrate clean, production-oriented smart contract design.
- Provide a flexible savings product with multiple saving plans (tenor, APR, penalties).
- Explore UX patterns using NFTs as certificates for financial products.

### Purpose

- **Educational**: Show how to design fixed-term deposits, interest accrual, early-withdraw penalties, and NFT-based receipts.
- **Product-Oriented**: Provide a small but realistic building block for DeFi / banking-like applications.

---

## Key Features

- 📄 **Saving Plans**
	- Multiple plans configurable by admin (tenor, APR, deposit min/max, early-withdraw penalty).

- 💰 **Time-Locked Deposits**
	- Users lock an ERC20 token for a fixed period and earn interest at a predefined APR.

- 🪪 **NFT Deposit Certificates**
	- Each deposit is an ERC721 token owned by the depositor.
	- Burning the NFT corresponds to closing / renewing the deposit.

- 🔁 **Renewal at Maturity**
	- Users can renew a matured deposit into a new plan.
	- Principal + accrued interest is rolled into a fresh deposit.

- ⚠️ **Early Withdrawal with Penalty**
	- Users can withdraw before maturity but receive principal minus a configurable penalty.
	- Penalty can be sent to a fee receiver or retained as extra vault liquidity.

- 🏦 **Interest Vault**
	- Dedicated vault balance is used to pay interest.
	- Funded by the contract owner; optionally augmented by early-withdraw penalties.

- 👤 **One Active Deposit per User**
	- Each address can only have one active deposit at a time.
	- Convenient view helpers allow users to query their current deposit ID.

---

## Architecture

At a high level, the system consists of:

1. **MockStablecoin (ERC20)**
	 - Underlying asset for deposits and payouts.
2. **SavingBank (ERC721 + Ownable + Pausable + ReentrancyGuard)**
	 - Manages saving plans, deposits, withdrawals, renewals, and the interest vault.
3. **SavingBankFactory (optional)**
	 - Can be used to deploy multiple SavingBank instances for different tokens.

### High-Level Data Model

- **SavingPlan**
	- `tenorDays`: Term length.
	- `aprBps`: APR in basis points (e.g., 5000 = 50%).
	- `minDeposit` / `maxDeposit`: Deposit bounds.
	- `earlyWithdrawPenaltyBps`: Penalty rate in basis points.
	- `enabled`: Whether the plan is open for new deposits.

- **DepositInfo** (backed by an ERC721 token ID)
	- `principal`: Amount of ERC20 token locked.
	- `tenorDays`, `aprBps`, `earlyWithdrawPenaltyBps`: Snapshotted from plan at deposit creation.
	- `startAt`, `maturityAt`: Timestamps for term.
	- `status`: `Active`, `Withdrawn`, `EarlyWithdrawn`, `Renewed`, `Cancelled`.

- **Vault**
	- `vaultBalance`: Tracks tokens reserved for paying interest.
	- Separate from user principals, which are simply the contract's ERC20 balance.

---

## Core Smart Contracts

All contracts are located under `contracts/`.

### SavingBank.sol

Core time-locked savings logic:

- Manages saving plans (`createPlan`, `updatePlan`).
- Handles user deposits (`openDeposit`).
- Supports withdrawals at maturity (`withdrawAtMaturity`).
- Supports early withdrawals with penalty (`earlyWithdraw`).
- Allows rolling over matured deposits into a new plan (`renewDeposit`).
- Tracks each user's active deposit (`activeDepositOf`).
- Manages the interest vault (`fundVault`, `withdrawVault`).
- Pause / unpause via `Pausable` for emergency control.

### MockStablecoin.sol

- Simple ERC20 token used as the underlying stable asset for deposits.
- Intended for local development and testing.

### SavingBankFactory.sol

- (If enabled) Deploys new SavingBank instances pointing to different ERC20 tokens.
- Useful if you want multiple saving banks per asset.

---

## User Flows

### 1. Open a Deposit

1. Approve the SavingBank to spend the ERC20 tokens.
2. Call `openDeposit(planId, amount)`.
3. Contract:
	 - Validates plan, amount, and that the user has no other active deposit.
	 - Transfers `amount` from the user to the SavingBank.
	 - Mints an ERC721 deposit certificate to the user.
	 - Records `DepositInfo` with `status = Active`.

### 2. Check Current Deposit

- Call `getMyActiveDepositId()` to get your active `depositId` (or `0` if none).
- Use `deposits(depositId)` to view full details.

### 3. Withdraw at Maturity

1. Wait until `block.timestamp >= maturityAt`.
2. Call `withdrawAtMaturity(depositId)`.
3. Contract:
	 - Calculates interest based on principal, APR, and tenor.
	 - Deducts interest from `vaultBalance`.
	 - Burns the deposit NFT.
	 - Transfers `principal + interest` to the user.

### 4. Early Withdraw (Before Maturity)

1. Call `earlyWithdraw(depositId)`.
2. Contract:
	 - Applies penalty: `penalty = principal * penaltyBps / 10000`.
	 - Sends `principal - penalty` back to the user.
	 - Sends penalty to `feeReceiver`, or, if `feeReceiver == address(0)`, adds it to `vaultBalance`.
	 - Burns the deposit NFT and updates status.

### 5. Renew Deposit at Maturity

1. After maturity, call `renewDeposit(oldDepositId, newPlanId)`.
2. Contract:
	 - Calculates interest and removes it from `vaultBalance`.
	 - Computes new principal = old principal + interest.
	 - Validates against new plan's min / max.
	 - Marks old deposit as `Renewed` and burns old NFT.
	 - Creates a new `DepositInfo`, mints a new NFT, and marks it as the user's active deposit.

---

## Admin Flows

Admin functions are restricted to the contract owner (`Ownable`).

- **Plan Management**
	- `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`
	- `updatePlan(planId, tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`

- **Vault Management**
	- `fundVault(amount)` – transfer ERC20 tokens from owner into the vault.
	- `withdrawVault(amount)` – withdraw unused interest funds back to owner.

- **Fee Receiver**
	- `setFeeReceiver(address)` to set where early-withdraw penalties go.

- **Emergency Controls**
	- `pause()` / `unpause()` – pause user-sensitive actions in emergencies.

---

## Interest & Penalty Model

Interest for a full term is computed as:

$$
	ext{interest} = \frac{\text{principal} \times \text{aprBps} \times \text{tenorSeconds}}{365\,\text{days} \times 10000}
$$

Where:

- `aprBps` is APR in basis points (e.g., 1000 = 10%).
- `tenorSeconds = tenorDays * 1 days`.

Penalty for early withdrawal:

$$
	ext{penalty} = \min\left(\text{principal}, \frac{\text{principal} \times \text{penaltyBps}}{10000}\right)
$$

This ensures penalty never exceeds principal.

---

## Prerequisites

- Node.js (LTS recommended)
- pnpm / npm / yarn (one package manager)
- Hardhat
- A local Ethereum node (e.g., Hardhat Network) or RPC endpoint for testnets

---

## Installation

Clone the repository and install dependencies:

```bash
git clone <this-repo-url>
cd AC_CAPSTON_SAVE_BANKING
npm install
```

Build the TypeScript / Hardhat artifacts:

```bash
npx hardhat compile
```

---

## Configuration

You can optionally create a `.env` file for network configuration and private keys if you plan to deploy to testnets.

Typical variables:

```bash
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here   # use testnet keys only
```.

Integrate them into your Hardhat config (see `hardhat.config.ts`).

---

## Usage (Hardhat)

### Local Development Network

Start a local Hardhat network (if needed):

```bash
npx hardhat node
```

### Deploy Contracts

Use your own deployment scripts or the provided ignition modules (if any) to deploy:

```bash
npx hardhat run scripts/deploy.ts --network localhost
```

Adjust the script path and network name to match your setup.

### Interact via Hardhat Console

Example (pseudo-code using ethers in the console):

```js
const [owner, user] = await ethers.getSigners();
const SavingBank = await ethers.getContractFactory("SavingBank");
const bank = await SavingBank.attach("<deployed-address>");

// View plans
const plan = await bank.plans(1);

// View your active deposit
const myId = await bank.getMyActiveDepositId();
```

---

## Testing

Run the test suite (see `test/` folder, e.g. `Lock.ts` and others you add):

```bash
npx hardhat test
```

You can also run a specific test file:

```bash
npx hardhat test test/SavingBank.ts
```

*(Update test file names as your project evolves.)*

---

## Project Structure

High-level layout of this repository:

```text
AC_CAPSTON_SAVE_BANKING/
├── contracts/
│   ├── SavingBank.sol          # Core savings logic (ERC721 certificate + vault)
│   ├── MockStablecoin.sol      # ERC20 stable token for testing
│   ├── SavingBankFactory.sol   # (Optional) factory for multiple SavingBanks
│   └── Lock.sol                # Hardhat default sample
├── test/                       # Tests (TypeScript)
│   └── Lock.ts                 # Extend with SavingBank tests
├── artifacts/                  # Compiled contract artifacts (auto-generated)
├── typechain-types/            # Type-safe contract bindings (auto-generated)
├── hardhat.config.ts           # Hardhat configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # Project documentation
```

---

## Security Considerations

- This is an educational capstone project; **do not** deploy to mainnet with real funds without a professional audit.
- Always review:
	- Access control (only owner can modify plans / vault / feeReceiver).
	- Pausable logic for incident response.
	- Interest vault funding (ensure `vaultBalance` is sufficient before enabling high APRs).
	- ERC20 token behavior (non-standard tokens may require SafeERC20).

---

## Future Improvements

Some ideas for extending this project:

- Support multiple concurrent deposits per user (with better UX).
- Off-chain front-end UI to visualize deposit NFTs and interest.
- Variable-rate plans with interest that accrues per block.
- Integration with real stablecoins on testnets.
- On-chain reward tokens or loyalty points for long-term savers.

---

## License

This project is licensed under the MIT License.
