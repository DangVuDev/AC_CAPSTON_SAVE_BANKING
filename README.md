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

- `SavingBankUpgradeable` — upgradable core (plans, vault, open/withdraw/renew logic)
- `DepositRegistry` — non-upgradable state holder for deposits
- `DepositCertificateUpgradeable` — ERC721 certificate (tokenId == depositId)
- `SavingBankUpgradeableFactory` — deploys wired instances per ERC20
```
+================================================================================+
|                          SAVING BANK DETAILED ARCHITECTURE                     |
+================================================================================+

      [ ACTORS ]                                     [ FACTORY LAYER ]
    +------------+                         +-----------------------------------+
    |   ADMIN    |                         |   SavingBankUpgradeableFactory    |
    +------------+                         +-----------------------------------+
          |                                          | deploys & links
          | (1) Create Bank (token, name, sym)       | (registry, cert, bank)
          v                                          v
+--------------------------------------------------------------------------------+
| [ CORE LOGIC LAYER ]                                                           |
|                                                                                |
|                      SavingBankUpgradeable (Proxy/Logic)                       |
|   +------------------------------------------------------------------------+   |
|   | - Logic: openDeposit, renew, withdrawAtMaturity, earlyWithdraw         |   |
|   | - Admin: createPlan, updatePlan, fundVault, pause/unpause              |   |
|   +------------------------------------------------------------------------+   |
|           |                        |                       |                   |
|           | (A) create/mark        | (B) mint/burn         | (C) fund/withdraw |
|           v                        v                       v                   |
|  +------------------+     +------------------+     +------------------+        |
|  | DepositRegistry  |     |DepositCertificate|     |      Vault       |        |
|  +------------------+     +------------------+     +------------------+        |
|  | [ STATE HOLDER ] |     | [ ERC721 NFT ]   |     | [ ASSET HOLDER ] |        |
|  | - nextDepositId  |     | - tokenId (1:1)  |     | - vaultBalance   |        |
|  | - _deposits map  |     | - ownerOf        |     | - safeTransfer   |        |
|  | - activeList     |     | - metadata       |     | - immutableToken |        |
|  +------------------+     +------------------+     +------------------+        |
|                                                                                |
+--------------------------------------------------------------------------------+
          |                                                   |
          | Read State                                        | Transfer Token
          v                                                   v
    +------------+                                      +------------+
    |  Frontend  | <----------------------------------- |    USER    |
    +------------+            (Approve USDC)            +------------+

```



```
+================================================================================+
|                          ACCESS CONTROL & PERMISSIONS MAP                      |
+================================================================================+

      [ SUPER ADMIN / OWNER ]                    [ SYSTEM EXECUTABLE ]
                 |                                         |
        (Quyền tối cao - onlyOwner)               (Quyền vận hành logic)
                 |                                         |
                 v                                         v
+-----------------------------------+     +-----------------------------------+
|   SavingBankUpgradeableFactory    |     |      SavingBankUpgradeable        |
+-----------------------------------+     +-----------------------------------+
| - Triển khai hệ thống             |     | - Thực thi logic nạp/rút          |
| - Chuyển quyền cho Bank Owner     |     | - Là "Executable" duy nhất        |
+-----------------+-----------------+     +-----------------+-----------------+
                  |                                         |
                  |                                         |
                  |             CHỈ CHO PHÉP (Only)         |
                  +-----------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------------+
|                          STORAGE & RESOURCE LAYER                              |
+================================================================================+
|                                                                                |
|  1. DepositRegistry (Data Holder)                                              |
|     - modifier onlyExecutable:                                                 |
|       -> CHỈ SavingBank được ghi dữ liệu (create/mark status).                 |
|       -> Admin CHỈ được set quyền Executable.                                  |
|                                                                                |
|  2. DepositCertificate (NFT Holder)                                            |
|     - modifier onlySavingBankExecutable:                                       |
|       -> CHỈ SavingBank được phép Mint (khi gửi) và Burn (khi rút).            |
|       -> User CHỈ sở hữu, không được tự tạo/hủy chứng chỉ.                     |
|                                                                                |
|  3. Vault (Asset Holder)                                                       |
|     - modifier onlySavingBankOrOwner:                                          |
|       -> CHỈ SavingBank được rút tiền để trả cho User.                         |
|       -> Admin được rút tiền dư thừa hoặc nạp thêm thanh khoản.                |
|                                                                                |
+--------------------------------------------------------------------------------+
```

```
+================================================================================+
|                        CHI TIẾT CÁC QUYỀN TRUY CẬP                             |
+================================================================================+

1. QUYỀN CỦA ADMIN (OWNER):
   - Quản lý Plan (Thêm/Sửa/Xóa gói tiết kiệm).
   - Pause/Unpause (Dừng hệ thống khẩn cấp).
   - Set Fee Receiver (Ví nhận tiền phạt).
   - Set Bank Executable (Chỉ định contract logic nào được phép ghi dữ liệu).
   - Withdraw Vault (Rút lợi nhuận từ Vault).

2. QUYỀN CỦA SAVING BANK (CORE EXECUTABLE):
   - Gọi Registry để tạo/cập nhật trạng thái sổ.
   - Gọi Certificate để Mint/Burn NFT.
   - Gọi Vault để giải ngân tiền cho User.
   - Lưu ý: User KHÔNG THỂ gọi trực tiếp vào 3 contract này.

3. QUYỀN CỦA USER:
   - Thao tác thông qua SavingBank (openDeposit, withdraw, renew).
   - Quyền sở hữu NFT (được kiểm tra chéo qua registry.isOwnerOf).
```


   


```
+================================================================================+
|                          USER FUNCTIONAL WORKFLOWS                             |
+================================================================================+

  (1) OPEN DEPOSIT (Mở sổ)
  User --(Approve)--> USDC --(openDeposit)--> SavingBank --(Transfer)--> Vault
                                                 |
                                                 |-- Register Metadata in Registry
                                                 |-- Mint NFT for User

  (2) WITHDRAW (Rút tiền - Đúng hạn hoặc Sớm)
  User --(withdraw)--> SavingBank --(Verify NFT)--> Registry
                               |
                               |-- Calculate: Principal + Interest (Matured)
                               |          OR: Principal - Penalty (Early)
                               |
                               |-- Vault --(USDC)--> User
                               |-- Burn NFT & Mark Status "Withdrawn"

  (3) RENEW (Gia hạn - Lãi kép)
  User --(renew)--> SavingBank --(Check Maturity)--> Registry
                               |
                               |-- NewPrincipal = Principal + Interest
                               |-- Burn Old NFT -> Mint New NFT
                               |-- Registry: Old -> "Renewed" | New -> "Active"
```


```
+================================================================================+
|                         ADMIN FUNCTIONAL WORKFLOWS                             |
+================================================================================+

  (1) PLAN MANAGEMENT (Quản lý gói)
  Admin --(createPlan)--> [ SavingBank ] --> Gán ID mới (ID: 1, 2, 3...)
  Admin --(updatePlan)--> [ SavingBank ] --> Chỉnh sửa APR, Tenor, Min/Max
                                             (Gói cũ đã mở không bị ảnh hưởng)

  (2) VAULT & LIQUIDITY (Quản lý thanh khoản)
  Admin --(fundVault)----> Nạp thêm USDC vào Vault để trả lãi
  Admin --(withdrawVault)-> Rút USDC dư thừa/Lợi nhuận từ Vault về ví Admin
  Admin --(setFeeReceiver)-> Cài đặt ví nhận tiền phạt (Penalty) khi User rút sớm

  (3) CIRCUIT BREAKER (Dừng khẩn cấp)
  Admin --(pause)--------> Đóng băng tất cả open/withdraw/renew (khi có sự cố)
  Admin --(unpause)------> Mở lại hệ thống sau khi kiểm tra an toàn

```
```
+================================================================================+
|                        DEPLOYMENT FLOW (FACTORY LEVEL)                         |
+================================================================================+

1. Admin calls Factory.createSavingBank(USDC_Address)
2. Factory DEPLOYS:
   |_ DepositRegistry (Lưu dữ liệu cho riêng USDC Bank)
   |_ DepositCertificate (NFT riêng cho USDC Bank)
   |_ SavingBankUpgradeable (Logic riêng cho USDC Bank)
3. SavingBank INITIALIZES:
   |_ Tự động tạo contract Vault mới (Gắn chặt với token USDC)
4. Factory SETS PERMISSIONS:
   |_ Registry: Chỉ nhận lệnh từ SavingBank này
   |_ Certificate: Chỉ cho phép SavingBank này Mint/Burn
5. Factory TRANSFERS OWNERSHIP:
   |_ Chuyển quyền Admin toàn bộ bộ 3 contract này về cho người gọi (Creator)

```











For details see [docs/PLAN.md](docs/PLAN.md).

---

## Common scripts

Scripts are in the `scripts/` folder. Common commands:

- Create a sample bank (local):

   `npx hardhat run scripts/00_create-sample-bank.ts --network localhost`

- Seed plans for a bank:

   `npx hardhat run scripts/01_seed-plans.ts --network localhost`

- Open a deposit (example flow):

   `npx hardhat run scripts/02_interact-open-deposit.ts --network localhost`

- Withdraw at maturity:

   `npx hardhat run scripts/04_interact-withdraw-maturity.ts --network localhost`

- Early withdraw (penalty):

   `npx hardhat run scripts/03_interact-early-withdraw.ts --network localhost`

- Renew deposit:

   `npx hardhat run scripts/05_interact-renew.ts --network localhost`

--


## . Chạy các bài test integration riêng lẻ để kiểm tra logic cụ thể
npx hardhat test test/integration/open-deposit.test.ts
npx hardhat test test/integration/withdraw-maturity.test.ts
npx hardhat test test/integration/early-withdraw.test.ts
npx hardhat test test/integration/renew-deposit.test.ts
npx hardhat test test/integration/fund-vault.test.ts

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



---
### Verify

MockERC20
```
https://sepolia.etherscan.io/address/0xEFaA690F939cac21Cdf197B83742c06FF95298b7#code
```
Factory
```
https://sepolia.etherscan.io/address/0x8a328848cf9F911F1E54f2333125AB2dB6964cAd#code
```
---

## Contributing

1. Fork the repo
2. Create a branch for your feature
3. Add tests for new behavior
4. Open a PR with a clear description

---

## License

MIT
