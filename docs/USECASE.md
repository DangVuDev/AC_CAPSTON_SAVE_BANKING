
# USE CASES – SavingBank NFT Time-Locked Savings (v2)

## 1. Actors / Các vai trò

- **Depositor (User) / Người gửi tiền**
  - Open, withdraw at maturity, early withdraw, renew deposit.
  - Manage NFT certificate representing each deposit.
- **Bank Admin (Owner) / Quản trị viên**
  - Configure saving plans (tenor, APR, min/max, penalty).
  - Manage interest vault, fee receiver.
  - Pause/unpause system for safety.
- **SavingBank Factory User / Người dùng Factory**
  - Create new SavingBank instances for any ERC20 token.

> **Note:** In v2, all deposit state (DepositInfo, status, activeDepositOf) is stored in a separate `DepositRegistry` contract. Each deposit is represented by an NFT certificate (DepositCertificateUpgradeable). The SavingBank core only handles logic and delegates state/NFT to registry contracts. If the core is upgraded or replaced, all deposit state and NFTs remain safe and unchanged.

---

## 2. Use Cases / Các kịch bản nghiệp vụ

### UC-01: Admin creates a Saving Plan / Admin tạo gói tiết kiệm

- **Actor:** Bank Admin
- **Goal:** Add a new saving plan with custom configuration.
- **Preconditions:**
  - Caller is the owner of SavingBank.
  - Underlying ERC20 token is set.
- **Main Flow:**
  1. Admin calls `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`.
  2. Contract validates input (tenorDays > 0, aprBps <= MAX_APR_BPS, penaltyBps <= MAX_PENALTY_BPS, maxDeposit == 0 or >= minDeposit).
  3. Contract creates new `SavingPlan`, increments `planId`.
  4. Emit `PlanCreated` event.
- **Postconditions:**
  - New plan is stored in `plans[planId]` with enabled/disabled status.

---

### UC-02: Admin updates a Saving Plan / Admin cập nhật gói tiết kiệm

- **Actor:** Bank Admin
- **Goal:** Change configuration of an existing saving plan.
- **Preconditions:**
  - Caller is owner.
  - `plans[planId]` exists.
- **Main Flow:**
  1. Admin calls `updatePlan(planId, tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`.
  2. Contract validates input as in UC-01.
  3. Contract updates the `SavingPlan` struct.
  4. Emit `PlanUpdated` event.
- **Postconditions:**
  - Plan is updated, applies to new deposits only.

---

### UC-03: Admin funds the vault / Admin nạp vault trả lãi

- **Actor:** Bank Admin
- **Goal:** Add liquidity to the interest vault to ensure enough funds for interest payouts.
- **Preconditions:**
  - Caller is owner.
  - Admin has approved SavingBank to transfer `amount` tokens.
- **Main Flow:**
  1. Admin calls `fundVault(amount)`.
  2. Contract checks `amount > 0`.
  3. Contract calls `token.transferFrom(owner, address(this), amount)`.
  4. Increases `vaultBalance`.
  5. Emit `VaultFunded` event.
- **Postconditions:**
  - `vaultBalance` increases, ready to pay interest for deposits.

---

### UC-04: Admin withdraws from vault / Admin rút vốn khỏi vault

- **Actor:** Bank Admin
- **Goal:** Withdraw unused interest funds.
- **Preconditions:**
  - Caller is owner.
  - `amount <= vaultBalance`.
- **Main Flow:**
  1. Admin calls `withdrawVault(amount)`.
  2. Contract checks `amount > 0` and `amount <= vaultBalance`.
  3. Decreases `vaultBalance`.
  4. Transfers tokens to owner.
  5. Emit `VaultWithdrawn` event.
- **Postconditions:**
  - Vault decreases; does not affect user principal.

---

### UC-05: Admin sets fee receiver / Admin cấu hình fee receiver

- **Actor:** Bank Admin
- **Goal:** Set address to receive early withdrawal penalties.
- **Preconditions:**
  - Caller is owner.
- **Main Flow:**
  1. Admin calls `setFeeReceiver(newFeeReceiver)`.
  2. Contract updates `feeReceiver`.
  3. Emit `FeeReceiverUpdated` event.
- **Postconditions:**
  - Penalty from early withdrawal is sent to feeReceiver (if not zero address), or added to vault otherwise.

---

### UC-06: Admin pause/unpause system / Admin tạm dừng/kích hoạt lại hệ thống

- **Actor:** Bank Admin
- **Goal:** Pause or resume sensitive actions (open/withdraw/renew).
- **Preconditions:**
  - Caller is owner.
- **Main Flow:**
  1. Call `pause()` to enable paused state.
  2. Call `unpause()` to resume normal operation.
- **Postconditions:**
  - When paused: users cannot open/withdraw/renew deposits.
  - When unpaused: all actions resume.

---

### UC-07: User opens a deposit / User mở sổ tiết kiệm

- **Actor:** Depositor
- **Goal:** Lock ERC20 tokens in SavingBank and receive NFT certificate.
- **Preconditions:**
  - SavingBank is not paused.
  - Plan `planId` exists and is enabled.
  - User has approved SavingBank to transfer `amount` tokens.
  - `amount` is within [minDeposit, maxDeposit] of the plan.
  - User has no active deposit (current business rule).
- **Main Flow:**
  1. User calls `openDeposit(planId, amount)`.
  2. Contract checks plan, amount, and activeDepositOf[user] == 0.
  3. Contract transfers tokens from user to SavingBank.
  4. Core calls `DepositRegistry.createDeposit(...)` to store deposit and get `depositId`.
  5. Mint NFT certificate (ERC721) to user with `tokenId = depositId`.
  6. Registry updates `activeDepositOf[user] = depositId`.
  7. Emit `DepositOpened` event.
- **Postconditions:**
  - User loses tokens (locked in SavingBank), receives NFT as deposit proof.
  - Deposit info is indexed on-chain for queries.

---

### UC-08: User withdraws at maturity / User tất toán đúng hạn

- **Actor:** Depositor
- **Goal:** Receive principal + interest at maturity.
- **Preconditions:**
  - SavingBank is not paused.
  - Caller is owner of depositId.
  - `deposits[depositId].status == Active`.
  - `block.timestamp >= maturityAt`.
  - `vaultBalance` is sufficient to pay interest.
- **Main Flow:**
  1. User calls `withdrawAtMaturity(depositId)`.
  2. Contract validates owner, status, and time.
  3. Calculates interest.
  4. Decreases `vaultBalance` by interest.
  5. Marks deposit as Withdrawn.
  6. Burns NFT certificate.
  7. Transfers principal + interest to user.
  8. Clears `activeDepositOf[user]` if matches depositId.
  9. Emit `Withdrawn` event.
- **Postconditions:**
  - User receives principal + interest, NFT is burned, deposit is closed.

---

### UC-09: User early withdraws / User rút trước hạn

- **Actor:** Depositor
- **Goal:** Withdraw principal before maturity, accept penalty.
- **Preconditions:**
  - SavingBank is not paused.
  - Caller is owner of depositId.
  - `status == Active`.
  - `block.timestamp < maturityAt`.
- **Main Flow:**
  1. User calls `earlyWithdraw(depositId)`.
  2. Contract checks owner, status, and time.
  3. Calculates penalty (capped at principal).
  4. Calculates `userAmount = principal - penalty`.
  5. Marks deposit as EarlyWithdrawn, burns NFT.
  6. Transfers `userAmount` to user.
  7. If penalty > 0:
     - If `feeReceiver != address(0)`: transfer penalty to feeReceiver.
     - Else: add penalty to `vaultBalance`.
  8. Clears `activeDepositOf[user]` if matches depositId.
  9. Emit `Withdrawn` event.
- **Postconditions:**
  - User receives principal minus penalty, NFT is burned, deposit is closed.

---

### UC-10: User renews deposit / User gia hạn sổ tiết kiệm

- **Actor:** Depositor
- **Goal:** Roll over principal + interest into a new plan at maturity.
- **Preconditions:**
  - SavingBank is not paused.
  - Caller is owner of depositId.
  - `status == Active`.
  - `block.timestamp >= maturityAt`.
  - `newPlanId` exists and is enabled.
  - `vaultBalance` is sufficient to pay interest.
  - `newPrincipal = oldPrincipal + interest` is within min/max of new plan.
- **Main Flow:**
  1. User calls `renewDeposit(oldDepositId, newPlanId)`.
  2. Contract validates owner, status, time, and new plan.
  3. Calculates interest and checks vault.
  4. Calculates newPrincipal.
  5. Validates newPrincipal against new plan.
  6. Decreases `vaultBalance` by interest.
  7. Marks old deposit as Renewed, burns old NFT.
  8. Creates new deposit, mints new NFT, updates activeDepositOf.
  9. Emit `Renewed` event.
- **Postconditions:**
  - Old deposit is closed, new deposit starts, user has new NFT.

---

### UC-11: User views deposit status / User xem trạng thái sổ tiết kiệm

- **Actor:** Any user
- **Goal:** Query current or specific deposit info.
- **Preconditions:**
  - Contract deployed, data exists.
- **Main Flow:**
  - `getMyActiveDepositId()` / `getActiveDepositId(user)` returns current active depositId (or 0).
  - `DepositRegistry.deposits[depositId]` returns deposit details.
  - `plans[planId]` returns plan details.
- **Postconditions:**
  - Read-only, no state change.

---

### UC-12: User uses SavingBankFactory / User sử dụng Factory tạo ngân hàng riêng

- **Actor:** SavingBank Factory User
- **Goal:** Create a new SavingBank instance for any ERC20 token.
- **Preconditions:**
  - Factory is deployed, user wants to create a bank.
  - User has an ERC20 token (MockStablecoin or other).
- **Main Flow:**
  1. User calls `createSavingBank(token, name_, symbol_)` on SavingBankFactory.
  2. Factory deploys new SavingBank instance with token and NFT metadata.
  3. Factory transfers ownership of new SavingBank to `msg.sender`.
  4. Records bank address in `allBanks` and `userBanks[msg.sender]`.
  5. Emit `SavingBankCreated` event.
- **Postconditions:**
  - Caller becomes admin of a new SavingBank, can configure plans.

---

## 3. Business Rules / Quy tắc nghiệp vụ

- Each user can have only **one active deposit** at a time in the current SavingBank (can be changed in future versions).
- Each deposit is represented by a unique **ERC721 NFT certificate** (separate contract from core logic for future-proofing).
- Withdraw at maturity always uses interest from `vaultBalance`; if vault is insufficient, transaction reverts.
- Early withdrawal penalty **never exceeds principal**.
- Changes to saving plans **do not retroactively affect** existing deposits; each deposit snapshots plan parameters at creation.

---

*This document is bilingual (EN/VI) for clarity and onboarding. For more technical details, see PLAN.md and LOGIC_FUNCTION.md.*

> Lưu ý kiến trúc v2: Dữ liệu deposit (DepositInfo, trạng thái, activeDepositOf) được lưu trong contract **DepositRegistry** riêng và mỗi deposit có một **NFT certificate** (DepositCertificateUpgradeable). SavingBank core chỉ xử lý logic và gọi sang registry/NFT, vì vậy nếu core phải thay thế, state deposit + NFT vẫn được giữ nguyên.

## 2. Use Case Chi Tiết

### UC-01: Admin tạo Saving Plan

- **Actor:** Bank Admin
- **Mục tiêu:** Thêm gói tiết kiệm mới với cấu hình kỳ hạn và lãi suất.
- **Preconditions:**
  - Caller là owner của SavingBank.
  - Token ERC20 underlying đã được chọn cho SavingBank.
- **Main Flow:**
  1. Admin gọi `createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`.
  2. Contract validate tham số (tenorDays > 0, aprBps <= MAX_APR_BPS, penaltyBps <= MAX_PENALTY_BPS, maxDeposit == 0 hoặc >= minDeposit).
  3. Contract tạo `SavingPlan` mới, gán `planId` tăng dần.
  4. Emit `PlanCreated`.
- **Postconditions:**
  - Plan mới được lưu trong `plans[planId]` ở trạng thái enabled/disabled theo input.

---

### UC-02: Admin cập nhật Saving Plan

- **Actor:** Bank Admin
- **Mục tiêu:** Thay đổi cấu hình saving plan hiện có.
- **Preconditions:**
  - Caller là owner.
  - `plans[planId]` tồn tại.
- **Main Flow:**
  1. Admin gọi `updatePlan(planId, tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, enabled)`.
  2. Contract validate tham số như UC-01.
  3. Contract cập nhật struct `SavingPlan` tương ứng.
  4. Emit `PlanUpdated`.
- **Postconditions:**
  - Plan được cập nhật, áp dụng cho các deposit mở mới sau đó.

---

### UC-03: Admin nạp vault trả lãi

- **Actor:** Bank Admin
- **Mục tiêu:** Nạp thanh khoản vào liquidity vault để đảm bảo có đủ tiền trả lãi.
- **Preconditions:**
  - Caller là owner.
  - Admin đã `approve` SavingBank được chuyển `amount` token.
- **Main Flow:**
  1. Admin gọi `fundVault(amount)`.
  2. Contract kiểm tra `amount > 0`.
  3. Contract gọi `token.transferFrom(owner, address(this), amount)`.
  4. Tăng `vaultBalance` tương ứng.
  5. Emit `VaultFunded`.
- **Postconditions:**
  - `vaultBalance` tăng, sẵn sàng trả lãi cho các khoản tất toán/gia hạn.

---

### UC-04: Admin rút bớt vốn khỏi vault

- **Actor:** Bank Admin
- **Mục tiêu:** Thu hồi bớt phần vốn lãi chưa dùng.
- **Preconditions:**
  - Caller là owner.
  - `amount <= vaultBalance`.
- **Main Flow:**
  1. Admin gọi `withdrawVault(amount)`.
  2. Contract kiểm tra `amount > 0` và `amount <= vaultBalance`.
  3. Giảm `vaultBalance`.
  4. Chuyển token tới owner.
  5. Emit `VaultWithdrawn`.
- **Postconditions:**
  - Vault giảm tương ứng; không ảnh hưởng tới principal người gửi (cùng balance ERC20 nhưng được quản lý logic tách biệt).

---

### UC-05: Admin cấu hình fee receiver

- **Actor:** Bank Admin
- **Mục tiêu:** Thiết lập địa chỉ nhận penalty khi user rút trước hạn.
- **Preconditions:**
  - Caller là owner.
- **Main Flow:**
  1. Admin gọi `setFeeReceiver(newFeeReceiver)`.
  2. Contract cập nhật `feeReceiver`.
  3. Emit `FeeReceiverUpdated`.
- **Postconditions:**
  - Penalty từ UC-08 sẽ chảy về feeReceiver (nếu khác zero address), hoặc cộng vào vault nếu là zero address.

---

### UC-06: Admin pause / unpause hệ thống

- **Actor:** Bank Admin
- **Mục tiêu:** Tạm dừng hoặc kích hoạt lại các hành động nhạy cảm (open/withdraw/renew).
- **Preconditions:**
  - Caller là owner.
- **Main Flow:**
  1. Gọi `pause()` để bật trạng thái paused.
  2. Gọi `unpause()` để tắt trạng thái paused.
- **Postconditions:**
  - Khi paused: user không thể openDeposit/withdraw/earlyWithdraw/renew.
  - Khi unpaused: hoạt động trở lại bình thường.

---

### UC-07: User mở sổ tiết kiệm (Open Deposit)

- **Actor:** Depositor
- **Mục tiêu:** Gửi 1 lượng ERC20 vào SavingBank và nhận NFT certificate.
- **Preconditions:**
  - SavingBank không paused.
  - Plan `planId` tồn tại, enabled.
  - User đã `approve` SavingBank được chuyển `amount` token.
  - `amount` nằm trong khoảng [minDeposit, maxDeposit] của plan.
  - User không có active deposit (theo business rule hiện tại).
- **Main Flow:**
  1. User gọi `openDeposit(planId, amount)`.
  2. Contract kiểm tra điều kiện plan, amount, activeDepositOf[user] == 0.
  3. Contract gọi `token.transferFrom(user, SavingBank, amount)` để giữ principal.
  4. Core gọi `DepositRegistry.createDeposit(...)` để lưu `DepositInfo` on-chain và nhận `depositId`.
  5. Mint NFT certificate (ERC721) cho user với `tokenId = depositId`.
  6. Registry cập nhật `activeDepositOf[user] = depositId`.
  7. Emit `DepositOpened`.
- **Postconditions:**
  - User mất `amount` token (bị khoá trong SavingBank), nhận 1 NFT đại diện cho sổ tiết kiệm.
  - Thông tin deposit được index on-chain để truy vấn.

---

### UC-08: User tất toán đúng hạn (Withdraw at Maturity)

- **Actor:** Depositor
- **Mục tiêu:** Nhận lại principal + interest khi tới kỳ hạn.
- **Preconditions:**
  - SavingBank không paused.
  - Caller là owner của depositId.
  - `deposits[depositId].status == Active`.
  - `block.timestamp >= maturityAt`.
  - `vaultBalance` đủ để trả `interest`.
- **Main Flow:**
  1. User gọi `withdrawAtMaturity(depositId)`.
  2. Contract validate owner, status, thời gian.
  3. Tính interest = `principal * aprBps * tenorSeconds / (365 days * 10000)`.
  4. Giảm `vaultBalance` theo interest.
  5. Đánh dấu deposit `status = Withdrawn`.
  6. Burn NFT certificate của depositId.
  7. Gửi `principal + interest` về user.
  8. Xoá `activeDepositOf[user]` nếu trỏ tới depositId.
  9. Emit `Withdrawn(..., isEarly=false)`.
- **Postconditions:**
  - User không còn NFT, nhận đủ gốc + lãi.
  - Deposit không còn active (trạng thái trong DepositRegistry được cập nhật Withdrawn).

---

### UC-09: User rút trước hạn (Early Withdraw)

- **Actor:** Depositor
- **Mục tiêu:** Rút gốc trước hạn, chấp nhận bị phạt.
- **Preconditions:**
  - SavingBank không paused.
  - Caller là owner của depositId.
  - `status == Active`.
  - `block.timestamp < maturityAt`.
- **Main Flow:**
  1. User gọi `earlyWithdraw(depositId)`.
  2. Contract kiểm tra owner, status, thời gian.
  3. Tính penalty = `principal * penaltyBps / 10000`, giới hạn không quá principal.
  4. Tính `userAmount = principal - penalty`.
  5. Cập nhật `status = EarlyWithdrawn`, burn NFT.
  6. Gửi `userAmount` về user.
  7. Nếu penalty > 0:
     - Nếu `feeReceiver != address(0)`: chuyển penalty cho feeReceiver.
     - Ngược lại: cộng penalty vào `vaultBalance`.
  8. Xoá `activeDepositOf[user]` nếu trỏ tới depositId.
  9. Emit `Withdrawn(..., interest=0, isEarly=true)`.
- **Postconditions:**
  - User nhận lại gốc sau khi trừ penalty, mất quyền lãi.
  - Deposit kết thúc trong DepositRegistry, NFT bị burn.

---

### UC-10: User gia hạn (Renew / Roll-over)

- **Actor:** Depositor
- **Mục tiêu:** Tự động gộp cả gốc + lãi sang 1 kỳ hạn mới (cùng hoặc khác plan).
- **Preconditions:**
  - SavingBank không paused.
  - Caller là owner của depositId.
  - `status == Active`.
  - `block.timestamp >= maturityAt` (đã tới hạn).
  - `newPlanId` tồn tại và enabled.
  - `vaultBalance` đủ trả interest cho kỳ cũ.
  - `newPrincipal = oldPrincipal + interest` nằm trong min/max của newPlan.
- **Main Flow:**
  1. User gọi `renewDeposit(oldDepositId, newPlanId)`.
  2. Contract validate owner, status, thời gian, newPlan.
  3. Tính `interest` như UC-08.
  4. Giảm `vaultBalance` theo interest.
  5. Tính `newPrincipal = principal + interest`.
  6. Validate newPrincipal theo min/max của plan mới.
  7. Đánh dấu old deposit là `Renewed`, burn NFT cũ.
  8. Tạo deposit mới `newDepositId` với principal = newPrincipal và config từ newPlan.
  9. Mint NFT mới `newDepositId` cho user, update `activeDepositOf[user]`.
  10. Emit `Renewed(oldDepositId, newDepositId, newPrincipal)`.
- **Postconditions:**
  - Sổ cũ dừng, sổ mới bắt đầu ngay, user vẫn giữ 1 NFT active.
  - Registry lưu cả lịch sử sổ cũ (Renewed) lẫn sổ mới.

---

### UC-11: User xem trạng thái sổ tiết kiệm

- **Actor:** Depositor, bất kỳ user nào
- **Mục tiêu:** Truy vấn thông tin deposit hiện tại hoặc theo ID.
- **Preconditions:**
  - Contract deployed, dữ liệu tồn tại.
- **Main Flow:**
  - `getMyActiveDepositId()` / `getActiveDepositId(user)` (core gọi từ registry) → trả về depositId đang active (hoặc 0).
  - `DepositRegistry.deposits[depositId]` → xem chi tiết 1 deposit.
  - `plans[planId]` → xem chi tiết 1 plan.
- **Postconditions:**
  - Chỉ đọc dữ liệu, không thay đổi state.

---

### UC-12: User sử dụng SavingBankFactory để tạo ngân hàng riêng

- **Actor:** SavingBank Factory User
- **Mục tiêu:** Tạo 1 SavingBank instance mới cho 1 ERC20 token bất kỳ.
- **Preconditions:**
  - Factory được deploy, caller có nhu cầu tạo SavingBank.
  - Đã có 1 ERC20 token (MockStablecoin hoặc token khác) muốn sử dụng.
- **Main Flow:**
  1. User gọi `createSavingBank(token, name_, symbol_)` trên SavingBankFactory.
  2. Factory deploy instance SavingBank mới với `token` và metadata NFT.
  3. Factory chuyển ownership của SavingBank mới cho `msg.sender`.
  4. Ghi nhận địa chỉ bank vào `allBanks` và `userBanks[msg.sender]`.
  5. Emit `SavingBankCreated`.
- **Postconditions:**
  - Caller trở thành admin của một SavingBank mới, có thể cấu hình các plan riêng.

---

## 3. Business Rules Chính

- Mỗi user chỉ có **1 active deposit** tại một thời điểm trong SavingBank hiện tại (có thể thay đổi trong các version sau).
- Mỗi deposit được biểu diễn dưới dạng **NFT ERC721 riêng biệt** (deposit certificate), để tránh trộn ERC721 logic với SavingBank core trong các phiên bản refactor tiếp theo sẽ tách thành contract riêng.
- Tất toán đúng hạn luôn dùng nguồn lãi từ `vaultBalance`; nếu vault không đủ → giao dịch revert.
- Penalty rút trước hạn **không vượt quá principal**.
- Các thay đổi saving plan **không retroactive** cho các deposit đã mở; deposit snapshot các tham số tenorDays, aprBps, penalty tại thời điểm mở.
