# Tài liệu thiết kế & kế hoạch triển khai

Dự án: **AC Capstone – Smart Contract Sổ Tiết Kiệm (Saving Bank)**  
Môi trường: Hardhat + TypeScript + Solidity

---

## 1. Mục tiêu & Ý tưởng tổng quan

### 1.1. Bài toán mô phỏng ngân hàng tiết kiệm on-chain

Dự án mô phỏng một ngân hàng cung cấp sản phẩm **gửi tiết kiệm có kỳ hạn** bằng token ERC20 (stablecoin giả lập). Người dùng gửi tiền vào smart contract theo **các gói tiết kiệm (Saving Plan)** với:

- Kỳ hạn (tenorDays): 7 / 30 / 90 / 180 / ... ngày.
- Lãi suất năm (APR) đo bằng basis points (BPS), ví dụ 800 = 8%/năm.
- Số tiền gửi tối thiểu / tối đa (minDeposit / maxDeposit – có thể optional).
- Mức phạt rút trước hạn (earlyWithdrawPenaltyBps).
- Trạng thái (enabled / disabled).

Mỗi lần gửi, người dùng mở một **sổ tiết kiệm (Deposit Certificate)** tương tự như một **Sổ tiết kiệm giấy / sổ phụ** ngoài đời, nhưng ở đây được biểu diễn như một **NFT (ERC721)** với mã `depositId`.

Khi đến hạn, người dùng có thể:

- Tất toán (rút gốc + lãi).
- Hoặc **gia hạn (renew / roll-over)**: gộp lãi vào gốc và mở kỳ mới.

Lãi được trả từ **liquidity vault** do Admin nạp vào từ trước.

### 1.2. Actors

- **Depositor (User)**:
  - Gửi tiền (open deposit).
  - Tất toán đúng hạn (withdraw at maturity).
  - Rút trước hạn (early withdraw) – bị phạt.
  - Gia hạn / rollover sang kỳ mới.

- **Bank Admin**:
  - Tạo / cập nhật các Saving Plan.
  - Nạp token vào liquidity vault (`fundVault`).
  - Rút bớt token khỏi vault theo policy (`withdrawVault`).
  - Cấu hình fee receiver (`setFeeReceiver`).
  - `pause/unpause` hệ thống khi cần.

### 1.3. Token sử dụng

- Một token ERC20 mock, đóng vai trò **stablecoin** (giống USDC).
- Có thể chọn:
  - 6 decimals như USDC, hoặc
  - 18 decimals như các ERC20 phổ biến.
- Đề xuất: dùng `18 decimals` để dễ tương thích với nhiều thư viện mẫu, nhưng thiết kế nên **không phụ thuộc cứng** vào số thập phân.

---

## 2. Yêu cầu chức năng chi tiết

### 2.1. Saving Plan (Gói tiết kiệm)

**Struct đề xuất**:

- `id`: uint256 – mã định danh plan.
- `tenorDays`: uint32 – số ngày kỳ hạn.
- `aprBps`: uint32 – lãi suất năm theo basis points.
- `minDeposit`: uint256 – số tiền tối thiểu (có thể 0).
- `maxDeposit`: uint256 – số tiền tối đa (0 = unlimited).
- `earlyWithdrawPenaltyBps`: uint32 – phần trăm phạt rút trước hạn theo basis points.
- `enabled`: bool – bật/tắt plan.

**Yêu cầu nghiệp vụ**:

- Admin có thể tạo Plan mới: `createPlan(...)`.
- Admin có thể cập nhật Plan: `updatePlan(planId, ...)`.
- Không cho phép:
  - `tenorDays == 0`.
  - `aprBps` và `earlyWithdrawPenaltyBps` vượt quá một ngưỡng tối đa (để tránh nhập nhầm 100000%).
- Phát event:
  - `PlanCreated(planId, tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled)`.
  - `PlanUpdated(planId, tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled)`.

### 2.2. Deposit Certificate (Sổ tiết kiệm – như NFT)

Mỗi sổ tiết kiệm ứng với một **depositId**, có thể triển khai bằng **ERC721** hoặc mô phỏng NFT-like ID (mapping + counter). Yêu cầu đề bài gợi ý: "Mỗi sổ là NFT-like id (depositId). (ERC721 thật)" nên thiết kế như sau:

- Contract `DepositCertificate` kế thừa ERC721, hoặc
- Gộp vào `SavingBank` và implement ERC721 ở đó.

**Thông tin mỗi sổ**:

- `depositId`: uint256.
- `owner`: address.
- `planId`: uint256 – tham chiếu tới Saving Plan.
- `principal`: uint256 – số tiền gốc gửi.
- `startAt`: uint64 – timestamp (block.timestamp) khi gửi.
- `maturityAt`: uint64 – timestamp khi đáo hạn.
- `status`: enum (Active, Withdrawn, EarlyWithdrawn, Renewed, Cancelled...).

**Event**:

- `DepositOpened(depositId, owner, planId, principal, maturityAt)`.

**Nghiệp vụ**:

- Người dùng gọi `openDeposit(planId, amount)`:
  - Kiểm tra Plan tồn tại và `enabled`.
  - Kiểm tra `amount >= minDeposit` và (nếu `maxDeposit > 0`) thì `amount <= maxDeposit`.
  - Transfer token từ user vào contract (`token.transferFrom(msg.sender, address(this), amount)`).
  - Tạo `depositId` mới.
  - Tính `maturityAt = block.timestamp + tenorDays * 1 days`.
  - Lưu struct Deposit.
  - Mint NFT `depositId` cho user (nếu dùng ERC721).
  - Emit `DepositOpened`.

### 2.3. Tất toán đúng hạn (Withdraw at maturity)

Yêu cầu:

- Cho phép người dùng rút khi:
  - `block.timestamp >= maturityAt`.
  - `status == Active`.
- Công thức lãi đơn:

  $$\text{interest} = \frac{principal \times aprBps \times tenorSeconds}{365\,days \times 10000}$$

  Trong đó:

  - `tenorSeconds = tenorDays * 1 days` (lúc tạo deposit đã biết tenorDays từ plan).
  - `aprBps` là basis points (800 = 8.00%).
- Tổng tiền user nhận:
  - `payout = principal + interest`.
- Nguồn tiền lãi:
  - Lãi được rút từ **liquidity vault** – tức là từ số token Admin đã nạp vào vault.
  - Cần kiểm tra vault đủ số dư để trả lãi.

**Event**:

- `Withdrawn(depositId, owner, principal, interest, isEarly = false)`.

**Nghiệp vụ chi tiết**:

- Hàm `withdrawAtMaturity(depositId)` (hoặc gộp thành `withdraw(depositId)` và phân nhánh theo thời gian):
  - Check caller là owner của `depositId` (hoặc được approve nếu dùng ERC721 estándar).
  - Check `status == Active`.
  - Check `block.timestamp >= maturityAt`.
  - Tính `interest` theo công thức trên.
  - Check vault balance đủ trả `interest`.
  - Update `status = Withdrawn`.
  - Burn NFT hoặc giữ NFT nhưng đánh dấu status (tuỳ thiết kế – đề xuất **burn** để đơn giản).
  - Transfer `principal` từ contract đến user.
  - Transfer `interest` từ `vaultBalance` (hoặc từ contract nhưng track riêng) đến user.
  - Emit `Withdrawn`.

### 2.4. Rút trước hạn (Early withdraw)

Yêu cầu:

- Nếu rút trước hạn, user **không nhận đủ lãi**, có thể là:
  - Không nhận lãi (interest = 0), hoặc
  - Nhận một phần rất nhỏ (optional – nhưng requirements đang ưu tiên penalty tính trên **principal**).
- Có penalty tính theo principal:

  $$\text{penalty} = principal \times penaltyBps / 10000$$

- Số tiền user nhận:

  $$\text{userReceive} = principal - penalty$$

- Penalty chuyển đến:
  - `feeReceiver`, hoặc
  - Quay lại vault.

**Event**:

- `Withdrawn(depositId, owner, principal, interest=0 hoặc reduced, isEarly = true)`.

**Nghiệp vụ chi tiết**:

- Hàm `earlyWithdraw(depositId)` hoặc gộp `withdraw(depositId)` với điều kiện thời gian:
  - Check caller là owner.
  - Check `status == Active`.
  - Check `block.timestamp < maturityAt` (rút trước hạn).
  - Tính `penalty = principal * penaltyBps / 10000` với `penaltyBps = earlyWithdrawPenaltyBps` từ plan.
  - Tính `userAmount = principal - penalty`.
  - Xử lý penalty:
    - Nếu có `feeReceiver` khác 0, chuyển penalty tới đó.
    - Nếu không có (address(0)), cho penalty vào vault.
  - Update `status = EarlyWithdrawn`.
  - Burn NFT (hoặc tương đương).
  - Transfer `userAmount` cho user.
  - Emit `Withdrawn` (with isEarly = true).

### 2.5. Gia hạn (Renew / Roll-over)

Yêu cầu:

- Tại thời điểm đáo hạn, user có thể chọn:
  - **Tất toán gốc + lãi** như bình thường.
  - Hoặc **rollover**: gộp lãi vào gốc và mở kỳ mới:
    - Có thể giữ nguyên planId.
    - Hoặc chọn plan khác (ví dụ từ 7 ngày sang 30 ngày).

**Cách triển khai đề xuất**:

- Hàm `renewDeposit(depositId, newPlanId)`:
  - Check caller là owner.
  - Check `status == Active`.
  - Check `block.timestamp >= maturityAt`.
  - Tính `interest` như tất toán.
  - Check `vault` đủ tiền trả lãi (vì interest vẫn được trả, chỉ là **gộp vào principal mới**).
  - Tính `newPrincipal = principal + interest`.
  - (Optional) Check `newPrincipal` phù hợp `minDeposit` / `maxDeposit` của `newPlanId`.
  - Tạo `newDepositId` cho plan mới với `principal = newPrincipal`.
  - Set `status` của `oldDepositId = Renewed`.
  - Burn NFT cũ, mint NFT mới cho user.
  - Vault balance giảm đi `interest` (vì interest bây giờ chuyển thành **vốn gửi mới** của user, được giữ trong contract).
  - Event:
    - `Renewed(oldDepositId, newDepositId, newPrincipal)`.

### 2.6. Admin vault management

Yêu cầu:

- `fundVault(amount)`:
  - Admin transfer token từ admin vào contract.
  - Contract tăng `vaultBalance` (hoặc dùng `token.balanceOf` nhưng nên track riêng).
- `withdrawVault(amount)`:
  - Admin rút bớt token khỏi vault – phải đảm bảo **không ảnh hưởng khả năng trả lãi** (tối thiểu: không cho rút vượt `vaultBalance`).
- `setFeeReceiver(address)`:
  - Đặt địa chỉ nhận penalty.
- `pause()` / `unpause()`:
  - Dùng `Pausable` của OpenZeppelin để dừng các hàm nhạy cảm (openDeposit, withdraw, earlyWithdraw, renew...).


---

## 3. Thiết kế hợp đồng & kiến trúc

### 3.1. Danh sách hợp đồng (dự kiến)

- [contracts/MockStablecoin.sol](contracts/MockStablecoin.sol)
  - ERC20 mock token làm stablecoin.

- [contracts/SavingBank.sol](contracts/SavingBank.sol)
  - Hợp đồng chính quản lý saving plans, deposits, vault.

- [contracts/DepositCertificate.sol](contracts/DepositCertificate.sol)
  - ERC721 đại diện cho mỗi sổ tiết kiệm `depositId`.
  - Có thể gộp vào SavingBank nếu muốn đơn giản hóa, nhưng tách riêng giúp clean.

- (Optional) [contracts/Errors.sol](contracts/Errors.sol)
  - Khai báo custom errors để tiết kiệm gas.

### 3.2. SavingBank – cấu trúc chính

**Biến trạng thái chính**:

- `IERC20 public immutable token;` – token dùng để gửi.
- `address public feeReceiver;` – nơi nhận penalty.
- `uint256 public vaultBalance;` – số tiền hiện có trong vault (dùng để trả lãi).
- `uint256 public nextPlanId;` – auto-increment id cho plan.
- `uint256 public nextDepositId;` – auto-increment id cho deposit.

**Structs**:

```solidity
struct SavingPlan {
    uint256 id;
    uint32 tenorDays;
    uint32 aprBps;
    uint256 minDeposit;
    uint256 maxDeposit; // 0 = unlimited
    uint32 earlyWithdrawPenaltyBps;
    bool enabled;
}

enum DepositStatus { Active, Withdrawn, EarlyWithdrawn, Renewed, Cancelled }

struct DepositInfo {
    uint256 id;
    uint256 planId;
    address owner;
    uint256 principal;
    uint64 startAt;
    uint64 maturityAt;
    DepositStatus status;
}
```

**Mappings**:

- `mapping(uint256 => SavingPlan) public plans;`
- `mapping(uint256 => DepositInfo) public deposits;`

**Events** (theo yêu cầu đề bài + thêm một số event bổ trợ):

```solidity
event PlanCreated(...);
event PlanUpdated(...);
event DepositOpened(uint256 depositId, address indexed owner, uint256 indexed planId, uint256 principal, uint64 maturityAt);
event Withdrawn(uint256 depositId, address indexed owner, uint256 principal, uint256 interest, bool isEarly);
event Renewed(uint256 oldDepositId, uint256 newDepositId, uint256 newPrincipal);
event VaultFunded(address indexed from, uint256 amount);
event VaultWithdrawn(address indexed to, uint256 amount);
event FeeReceiverUpdated(address indexed newFeeReceiver);
```

**Modifiers**:

- `onlyAdmin` (dùng Ownable hoặc AccessControl).
- `whenNotPaused` cho các action chính.

### 3.3. Luồng hoạt động điển hình

1. **Admin** deploy `MockStablecoin` và mint token cho chính mình & user.
2. **Admin** deploy `SavingBank` với địa chỉ token.
3. **Admin** cấu hình ít nhất 1 `SavingPlan`.
4. **Admin** `fundVault(amount)` để nạp tiền trả lãi.
5. **User** approve token cho `SavingBank` (`token.approve`).
6. **User** `openDeposit(planId, amount)` → nhận `depositId` (NFT).
7. Sau khi đến hạn:
   - User gọi `withdrawAtMaturity(depositId)` hoặc `renewDeposit(depositId, newPlanId)`.
8. Nếu cần rút trước hạn:
   - User gọi `earlyWithdraw(depositId)`.


---

## 4. Thiết kế test & kịch bản kiểm thử

### 4.1. Các case chính cho Saving Plan

- Tạo plan hợp lệ.
- Không cho tạo plan với `tenorDays = 0`.
- Không cho tạo plan với `aprBps` vượt quá `MAX_APR_BPS`.
- Cập nhật plan: thay đổi lãi suất, kỳ hạn, bật/tắt.
- Không cho user dùng plan `enabled = false` để mở deposit.

### 4.2. Các case cho mở sổ (open deposit)

- Open deposit với amount nằm trong `[minDeposit, maxDeposit]`.
- Open deposit fail khi amount < minDeposit.
- Open deposit fail khi amount > maxDeposit (nếu maxDeposit > 0).
- Kiểm tra event `DepositOpened`.
- Đảm bảo `depositInfo` lưu đúng `owner`, `planId`, `principal`, `startAt`, `maturityAt`.

### 4.3. Rút đúng hạn

- Setup: vault có đủ tiền để trả lãi.
- Thời gian: giả lập bằng Hardhat `evm_increaseTime` hoặc `time.increase`.
- Sau khi đến hạn:
  - Gọi `withdrawAtMaturity` thành công.
  - Kiểm tra user balance tăng thêm `principal + interest`.
  - Kiểm tra vaultBalance giảm đi `interest`.
  - Kiểm tra `status` chuyển sang `Withdrawn`.

### 4.4. Rút trước hạn

- Setup: mở một deposit, chưa tới hạn.
- Gọi `earlyWithdraw`:
  - Kiểm tra không cho nếu `block.timestamp >= maturityAt`.
  - Kiểm tra số tiền user nhận đúng `principal - penalty`.
  - Kiểm tra penalty về đúng nơi (feeReceiver hoặc vault).
  - Kiểm tra event `Withdrawn` với `isEarly = true`.

### 4.5. Gia hạn (renew)

- Setup: deposit đến hạn.
- Gọi `renewDeposit(depositId, newPlanId)`:
  - Kiểm tra interest được tính đúng.
  - Kiểm tra `newPrincipal = principal + interest`.
  - Kiểm tra `oldDeposit` chuyển status sang `Renewed`.
  - Kiểm tra `newDeposit` được tạo với principal = `newPrincipal`.
  - Kiểm tra NFT cũ bị burn, NFT mới được mint.

### 4.6. Admin vault

- Test `fundVault`: 
  - Token từ admin chuyển sang contract.
  - `vaultBalance` tăng đúng amount.
- Test `withdrawVault`:
  - Chỉ admin được gọi.
  - Không thể rút > vaultBalance.
  - `vaultBalance` giảm.

### 4.7. Pause/unpause

- Khi `pause`:
  - Các hàm `openDeposit`, `withdraw`, `earlyWithdraw`, `renew` phải revert.
- Khi `unpause`:
  - Các hàm hoạt động bình thường.


---

## 5. Danh sách file & cấu trúc project đề xuất

Dựa trên cấu trúc hiện tại của project Hardhat, ta mở rộng như sau:

- [hardhat.config.ts](hardhat.config.ts)
- [tsconfig.json](tsconfig.json)
- [package.json](package.json)
- [contracts/Lock.sol](contracts/Lock.sol) (file mẫu Hardhat, có thể giữ hoặc xóa)
- **Hợp đồng mới**:
  - [contracts/MockStablecoin.sol](contracts/MockStablecoin.sol)
  - [contracts/SavingBank.sol](contracts/SavingBank.sol)
  - [contracts/DepositCertificate.sol](contracts/DepositCertificate.sol) (nếu tách riêng)

- **Test**:
  - [test/SavingBank.basic.ts](test/SavingBank.basic.ts)
    - Test flow cơ bản open/withdraw/earlyWithdraw.
  - [test/SavingBank.plans.ts](test/SavingBank.plans.ts)
    - Test CRUD Saving Plan.
  - [test/SavingBank.renew.ts](test/SavingBank.renew.ts)
    - Test roll-over.

- **Scripts (Hardhat)**:
  - [scripts/deployMockToken.ts](scripts/deployMockToken.ts)
  - [scripts/deploySavingBank.ts](scripts/deploySavingBank.ts)
  - [scripts/seedPlans.ts](scripts/seedPlans.ts)
  - [scripts/demoFlow.ts](scripts/demoFlow.ts) – chạy demo end-to-end.

- **Docs**:
  - [ProjectRequirement.md](ProjectRequirement.md) – file đề bài gốc.
  - [doc.md](doc.md) – tài liệu chi tiết thiết kế & kế hoạch (file hiện tại).


---

## 6. Hướng dẫn triển khai từng bước (tổng quan)

Bên dưới là **plan 5 ngày** chi tiết. Mỗi ngày liệt kê:

- Mục tiêu chính.
- Danh sách việc cụ thể.
- File cần tạo / chỉnh sửa.
- Các lệnh Hardhat gợi ý.


---

## 7. Plan triển khai trong 5 ngày

### 7.1. Ngày 1 – Thiết lập môi trường & Mock Token

**Mục tiêu**:

- Hoàn thiện môi trường Hardhat, cài packages cần thiết.
- Tạo ERC20 mock token (MockStablecoin) để dùng cho dự án.
- Viết test cơ bản cho Mock token.

**Công việc chi tiết**:

1. Kiểm tra & cài đặt dependencies
   - Mở file [package.json](package.json) và đảm bảo đã có các packages chính:
     - `hardhat`
     - `@nomicfoundation/hardhat-toolbox`
     - `typescript`, `ts-node`
     - `@typechain/hardhat`, `typechain`, `ethers`
   - Nếu thiếu, dùng lệnh:
     - `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox typescript ts-node typechain @typechain/hardhat`.

2. Cấu hình Hardhat
   - Mở [hardhat.config.ts](hardhat.config.ts).
   - Bổ sung:
     - Network local.
     - Solidity version (ví dụ `0.8.20`).
     - Plugins: `@nomicfoundation/hardhat-toolbox`, `@typechain/hardhat`.
   - Cấu hình paths nếu cần.

3. Tạo MockStablecoin
   - Tạo file [contracts/MockStablecoin.sol](contracts/MockStablecoin.sol).
   - Kế thừa `ERC20` và `Ownable` của OpenZeppelin:
     - Constructor nhận `name`, `symbol`.
     - Hàm `mint(address to, uint256 amount)` chỉ Owner được gọi.
   - Dùng `18 decimals` hoặc override `decimals()` nếu muốn 6.

4. Cài OpenZeppelin
   - Chạy:
     - `npm install @openzeppelin/contracts`.

5. Viết test cho MockStablecoin
   - Tạo file [test/MockStablecoin.ts](test/MockStablecoin.ts).
   - Test các case:
     - Owner có thể `mint`.
     - Non-owner không thể `mint`.
     - `transfer` hoạt động đúng.

6. Chạy test
   - Sử dụng lệnh:
     - `npx hardhat test`.
   - Sửa lỗi (nếu có) cho tới khi test pass.

**Kết quả cuối ngày 1**:

- MockStablecoin đã sẵn sàng dùng làm token gửi tiết kiệm.
- Môi trường Hardhat ổn định.

---

### 7.2. Ngày 2 – Thiết kế & cài đặt SavingBank (phần Plan + Vault)

**Mục tiêu**:

- Xây dựng skeleton contract SavingBank.
- Cài đặt chức năng quản lý Saving Plan.
- Cài đặt chức năng vault cơ bản: fundVault, withdrawVault.

**Công việc chi tiết**:

1. Tạo file SavingBank
   - Tạo file [contracts/SavingBank.sol](contracts/SavingBank.sol).
   - Import:
     - `IERC20`, `Ownable`, `Pausable` từ OpenZeppelin.
   - Khai báo biến trạng thái:
     - `IERC20 public immutable token;`
     - `address public feeReceiver;`
     - `uint256 public vaultBalance;`
     - `uint256 public nextPlanId;`
   - Khai báo `SavingPlan` struct và `plans` mapping.

2. Constructor
   - Nhận `IERC20 _token`.
   - Set `token = _token`.
   - Set `feeReceiver = owner()` (hoặc address(0) – sẽ set sau).

3. Các hàm quản lý Plan
   - `createPlan(...) external onlyOwner`:
     - Validate input (tenorDays > 0, aprBps <= MAX, penaltyBps <= MAX,...).
     - Tăng `nextPlanId`.
     - Lưu `plans[planId]`.
     - Emit `PlanCreated`.
   - `updatePlan(planId, ...) external onlyOwner`:
     - Kiểm tra plan tồn tại.
     - Cập nhật fields.
     - Emit `PlanUpdated`.

4. Các hàm quản lý Vault
   - `fundVault(uint256 amount) external onlyOwner`:
     - Gọi `token.transferFrom(msg.sender, address(this), amount)`.
     - Tăng `vaultBalance`.
     - Emit `VaultFunded`.
   - `withdrawVault(uint256 amount) external onlyOwner`:
     - Require `amount <= vaultBalance`.
     - Giảm `vaultBalance`.
     - `token.transfer(msg.sender, amount)`.
     - Emit `VaultWithdrawn`.

5. Cấu hình feeReceiver
   - Hàm `setFeeReceiver(address _feeReceiver) external onlyOwner`:
     - Set `feeReceiver = _feeReceiver`.
     - Emit `FeeReceiverUpdated`.

6. Pause/Unpause
   - Kế thừa `Pausable`.
   - Thêm hàm `pause()` / `unpause()` cho owner.
   - Các hàm hành động sau này (`openDeposit`, `withdraw`,...) cần `whenNotPaused`.

7. Viết test cho Plan + Vault
   - Tạo file [test/SavingBank.plans.ts](test/SavingBank.plans.ts).
   - Test các case create/update plan.
   - Test fundVault/withdrawVault.

8. Chạy test
   - `npx hardhat test`.

**Kết quả cuối ngày 2**:

- SavingBank đã có phần quản lý Plan và Vault hoạt động.

---

### 7.3. Ngày 3 – Cài đặt Deposit, Withdraw, Early Withdraw

**Mục tiêu**:

- Cài đặt logic mở sổ (open deposit).
- Cài đặt logic tất toán đúng hạn.
- Cài đặt logic rút trước hạn & penalty.

**Công việc chi tiết**:

1. Thiết kế DepositInfo & enum
   - Trong [contracts/SavingBank.sol](contracts/SavingBank.sol):
     - Thêm `enum DepositStatus`.
     - Thêm `DepositInfo` struct.
     - Thêm `mapping(uint256 => DepositInfo) public deposits;`.
     - Thêm `uint256 public nextDepositId;`.

2. Hàm openDeposit
   - Signatures gợi ý:
     - `function openDeposit(uint256 planId, uint256 amount) external whenNotPaused`.
   - Bước xử lý:
     - Lấy plan.
     - Require `plan.enabled`.
     - Require amount >= minDeposit.
     - Nếu `plan.maxDeposit > 0`, require amount <= maxDeposit.
     - Transfer token từ user vào contract.
     - `depositId = ++nextDepositId`.
     - Tính `startAt = uint64(block.timestamp)`.
     - Tính `maturityAt = uint64(block.timestamp + plan.tenorDays * 1 days)`.
     - Lưu `deposits[depositId]`.
     - Emit `DepositOpened`.

3. Hàm internal tính interest
   - Tạo hàm internal:

```solidity
function _calculateInterest(uint256 principal, uint32 aprBps, uint32 tenorDays) internal pure returns (uint256) {
    uint256 tenorSeconds = uint256(tenorDays) * 1 days;
    uint256 yearInSeconds = 365 days;
    return principal * aprBps * tenorSeconds / yearInSeconds / 10000;
}
```

4. Hàm withdrawAtMaturity
   - Signatures gợi ý:
     - `function withdrawAtMaturity(uint256 depositId) external whenNotPaused`.
   - Bước xử lý:
     - Lấy `DepositInfo storage dep = deposits[depositId];`.
     - Check caller là `dep.owner`.
     - Require `dep.status == DepositStatus.Active`.
     - Require `block.timestamp >= dep.maturityAt`.
     - Lấy `plan` tương ứng.
     - Tính `interest = _calculateInterest(dep.principal, plan.aprBps, plan.tenorDays)`.
     - Require `vaultBalance >= interest`.
     - `vaultBalance -= interest;`.
     - Update `dep.status = DepositStatus.Withdrawn;`.
     - Transfer `principal + interest` cho user.
     - Emit `Withdrawn(depositId, owner, principal, interest, false)`.

5. Hàm earlyWithdraw
   - Signature gợi ý:
     - `function earlyWithdraw(uint256 depositId) external whenNotPaused`.
   - Bước xử lý:
     - Lấy `dep` như trên.
     - Check caller owner.
     - Require `dep.status == Active`.
     - Require `block.timestamp < dep.maturityAt`.
     - Lấy `plan`.
     - Tính `penalty = dep.principal * plan.earlyWithdrawPenaltyBps / 10000`.
     - Tính `userAmount = dep.principal - penalty`.
     - Update `dep.status = EarlyWithdrawn`.
     - Transfer `userAmount` cho user.
     - Nếu `feeReceiver != address(0)`:
       - Transfer `penalty` cho `feeReceiver`.
       - Ngược lại: cộng `penalty` vào `vaultBalance` hoặc giữ trong contract.
     - Emit `Withdrawn(depositId, owner, principal, 0, true)` (nếu không trả lãi).

6. Viết test cho open/withdraw/earlyWithdraw
   - Tạo file [test/SavingBank.basic.ts](test/SavingBank.basic.ts).
   - Scenario 1: open → tới hạn → withdraw.
   - Scenario 2: open → rút trước hạn.
   - Check đầy đủ balance, status, events.

7. Chạy test
   - `npx hardhat test`.

**Kết quả cuối ngày 3**:

- Đã có flow cơ bản open / withdraw / earlyWithdraw hoàn chỉnh.

---

### 7.4. Ngày 4 – Cài đặt Renew/Roll-over + ERC721 DepositCertificate

**Mục tiêu**:

- Cài đặt chức năng renew/rollover.
- Tích hợp hoặc triển khai ERC721 đại diện depositId.

**Công việc chi tiết**:

1. Quyết định kiến trúc NFT
   - Option A: SavingBank kế thừa ERC721.
   - Option B: Tạo contract riêng [contracts/DepositCertificate.sol](contracts/DepositCertificate.sol).
   - Đề xuất: Để đơn giản, cho SavingBank kế thừa luôn ERC721, mỗi lần open/mint, withdraw/burn.

2. Thêm ERC721 vào SavingBank (nếu chọn Option A)
   - `contract SavingBank is Ownable, Pausable, ERC721 { ... }`.
   - Constructor: truyền `name`, `symbol` cho ERC721.
   - Khi openDeposit:
     - Sau khi tạo `depositId`, gọi `_safeMint(owner, depositId)`.
   - Khi withdraw / earlyWithdraw / renew:
     - Xử lý `_burn(depositId)` khi sổ kết thúc.

3. Hàm renewDeposit
   - Signature gợi ý:
     - `function renewDeposit(uint256 depositId, uint256 newPlanId) external whenNotPaused`.
   - Bước xử lý:
     - Lấy `dep`.
     - Check caller owner.
     - Require `dep.status == Active`.
     - Require `block.timestamp >= dep.maturityAt`.
     - Lấy plan cũ & plan mới.
     - Tính `interest` như withdrawAtMaturity.
     - Require `vaultBalance >= interest`.
     - `vaultBalance -= interest`.
     - Tính `newPrincipal = dep.principal + interest`.
     - Optional: check `newPrincipal` với `minDeposit`/`maxDeposit` của newPlan.
     - Update `dep.status = Renewed`.
     - Burn NFT cũ: `_burn(depositId)`.
     - Tạo `newDepositId = ++nextDepositId`.
     - Tính `startAt`, `maturityAt` mới theo `newPlan.tenorDays`.
     - Lưu `deposits[newDepositId]`.
     - Mint NFT mới cho user.
     - Emit `Renewed(oldDepositId, newDepositId, newPrincipal)`.

4. Test renewDeposit
   - Tạo file [test/SavingBank.renew.ts](test/SavingBank.renew.ts).
   - Scenario:
     - Admin tạo 2 plan: 30 ngày & 90 ngày.
     - User open deposit theo plan 30 ngày.
     - Tăng thời gian đến sau maturity.
     - Gọi `renewDeposit(depositId, newPlanId = 90-day plan)`.
     - Kiểm tra interest & newPrincipal.
     - Kiểm tra tồn tại `newDepositId` và `oldDepositId` status = Renewed.
     - Verify NFT logic (nếu triển khai ERC721).

5. Kiểm tra pause ảnh hưởng tới renew
   - Khi `pause()`, đảm bảo `renewDeposit` revert.

6. Chạy test
   - `npx hardhat test`.

**Kết quả cuối ngày 4**:

- Chức năng renew/roll-over hoàn chỉnh.
- Deposit được quản lý dưới dạng NFT-like id.

---

### 7.5. Ngày 5 – Dọn dẹp, tối ưu, tài liệu & demo script

**Mục tiêu**:

- Refactor code, bổ sung comment (nếu cần).
- Viết thêm doc cho user & admin.
- Tạo scripts demo deploy & chạy flow thực tế.

**Công việc chi tiết**:

1. Dọn dẹp & refactor
   - Tối ưu require -> custom errors (nếu muốn).
   - Gom logic lặp lại (ví dụ hàm internal validatePlan, getDepositOwner...).
   - Đảm bảo naming, visibility nhất quán.

2. Bổ sung events còn thiếu
   - Xem lại các function admin (pause, unpause, ...): có cần emit event không.

3. Viết tài liệu sử dụng cho Admin
   - Trong [doc.md](doc.md) hoặc file riêng:
     - Hướng dẫn deploy `MockStablecoin`.
     - Hướng dẫn deploy `SavingBank`.
     - Hướng dẫn tạo Saving Plan.
     - Hướng dẫn nạp vault, rút vault.
     - Hướng dẫn pause/unpause.

4. Viết tài liệu sử dụng cho User
   - Cách user chuẩn bị token (được mint từ admin/test script).
   - Cách user approve & open deposit.
   - Cách xem thông tin deposit, withdraw, early withdraw, renew.

5. Tạo scripts demo
   - [scripts/deployMockToken.ts](scripts/deployMockToken.ts):
     - Deploy MockStablecoin.
   - [scripts/deploySavingBank.ts](scripts/deploySavingBank.ts):
     - Deploy SavingBank với địa chỉ token.
   - [scripts/seedPlans.ts](scripts/seedPlans.ts):
     - Tạo vài plan mẫu (7 ngày, 30 ngày, 90 ngày,...).
   - [scripts/demoFlow.ts](scripts/demoFlow.ts):
     - Mint token cho user.
     - Approve SavingBank.
     - Open deposit.
     - Tăng time, withdraw hoặc renew.

6. Chạy thử scripts trên Hardhat local network
   - Sử dụng commands:
     - `npx hardhat run scripts/deployMockToken.ts --network localhost`
     - `npx hardhat run scripts/deploySavingBank.ts --network localhost`
     - `npx hardhat run scripts/seedPlans.ts --network localhost`
     - `npx hardhat run scripts/demoFlow.ts --network localhost`

7. Tổng kết & kiểm tra lại
   - Chạy lại toàn bộ test: `npx hardhat test`.
   - Kiểm tra coverage (nếu dùng `solidity-coverage`).

**Kết quả cuối ngày 5**:

- Project hoàn chỉnh, có đầy đủ hợp đồng, test, scripts demo, tài liệu.

---

## 8. Gợi ý mở rộng (beyond yêu cầu cơ bản)

Phần này không bắt buộc nhưng có thể cân nhắc nếu còn thời gian:

- Cho phép gửi **thêm** vào sổ đang Active (top-up principal), điều chỉnh lại maturity hoặc không.
- Hỗ trợ nhiều token khác nhau (multi-asset saving bank).
- Tích hợp front-end đơn giản (React/Next.js) để tương tác với contract.
- Thêm role-based access control (RBAC) cho các loại admin khác nhau.
- Hỗ trợ variable rate (thay APR theo thời gian) – phức tạp hơn.

---

## 9. Tóm tắt

- Dự án mô phỏng hệ thống ngân hàng tiết kiệm on-chain với ERC20 stablecoin.
- Hỗ trợ Saving Plan linh hoạt, lãi suất theo năm, phạt rút trước hạn.
- Mỗi lần gửi tạo ra một Deposit Certificate (NFT-like id), có thể withdraw/early withdraw/renew.
- Admin quản lý vault để trả lãi, feeReceiver để nhận penalty, và có thể pause hệ thống.
- Kế hoạch 5 ngày giúp triển khai tuần tự: từ mock token, kế hoạch, vault, đến logic deposit/withdraw/renew, test, scripts, và docs.

Từ tài liệu này, bạn có thể bắt đầu hiện thực hóa từng bước trong Hardhat project hiện tại và mở rộng dần khi cần.