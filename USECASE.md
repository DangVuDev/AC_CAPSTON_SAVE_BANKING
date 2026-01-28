# USE CASES - SavingBank NFT Time-Locked Savings

## 1. Actors

- **Depositor (User)**
  - Mở sổ tiết kiệm, tất toán đúng hạn, rút trước hạn, gia hạn.
  - Quản lý NFT certificate đại diện cho từng sổ tiết kiệm.
- **Bank Admin (Owner)**
  - Cấu hình saving plan (kỳ hạn, APR, min/max, penalty).
  - Quản lý vault lãi suất, fee receiver.
  - Quản lý trạng thái hệ thống (pause/unpause).
- **SavingBank Factory User**
  - Tạo các SavingBank instance mới cho từng ERC20 token.

---

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
  4. Tạo `depositId` mới và lưu `DepositInfo` (owner, planId, principal, startAt, maturityAt, status=Active,...).
  5. Mint NFT certificate (ERC721) cho user với `tokenId = depositId`.
  6. Cập nhật `activeDepositOf[user] = depositId`.
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
  - Deposit không còn active.

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
  - Deposit kết thúc, NFT bị burn.

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

---

### UC-11: User xem trạng thái sổ tiết kiệm

- **Actor:** Depositor, bất kỳ user nào
- **Mục tiêu:** Truy vấn thông tin deposit hiện tại hoặc theo ID.
- **Preconditions:**
  - Contract deployed, dữ liệu tồn tại.
- **Main Flow:**
  - `getMyActiveDepositId()` → trả về depositId đang active của caller (hoặc 0).
  - `getActiveDepositId(user)` → xem deposit active của 1 user khác.
  - `deposits[depositId]` → xem chi tiết 1 deposit.
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
