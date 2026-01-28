# LOGIC_FUNCTION - Phân tích chi tiết luồng xử lý

Tài liệu này mô tả chi tiết logic bên trong các hàm quan trọng của kiến trúc mới:
- SavingBankCoreUpgradeable (core logic)
- DepositCertificateUpgradeable (ERC721 certificate)
- SavingBankUpgradeableFactory (factory)

Tập trung vào:
- Input / output
- Kiểm tra (require/revert)
- Tác động lên storage
- Tương tác external (token, NFT, event)
- Security (Pausable, ReentrancyGuard, Ownable)

---

## 1. SavingBankCoreUpgradeable

### 1.1. initialize(token_, certificate_, owner_)

- **Mục đích:** Khởi tạo contract upgradable, thay cho constructor.
- **Input:**
  - `token_`: địa chỉ ERC20 underlying.
  - `certificate_`: địa chỉ contract ERC721 chứng chỉ gửi tiết kiệm (IDepositCertificate).
  - `owner_`: owner ban đầu của core (admin bank).
- **Kiểm tra:**
  - Nếu bất kỳ input nào là `address(0)` → `ZeroAddress()`.
- **Tác động:**
  - Gọi `__Ownable_init(owner_)`, `__Pausable_init()`, `__ReentrancyGuard_init()`.
  - Lưu `token = IERC20(token_)`.
  - Lưu `certificate = IDepositCertificate(certificate_)`.
  - Set `feeReceiver = owner_`.
  - Khởi tạo `nextPlanId = 1`, `nextDepositId = 1`.
- **Security:**
  - Chỉ được gọi 1 lần (modifier `initializer` của OZ).

---

### 1.2. createPlan(...)

- **Mục đích:** Tạo saving plan mới.
- **Modifier:** `onlyOwner`.
- **Input:** `tenorDays`, `aprBps`, `minDeposit`, `maxDeposit`, `earlyWithdrawPenaltyBps`, `enabled`.
- **Kiểm tra:**
  - `tenorDays > 0`.
  - `aprBps <= MAX_APR_BPS` (giới hạn APR).
  - `earlyWithdrawPenaltyBps <= MAX_PENALTY_BPS`.
  - Nếu `maxDeposit != 0` thì `maxDeposit >= minDeposit`.
- **Tác động:**
  - Tăng `nextPlanId`, dùng làm `planId` mới.
  - Gán struct `SavingPlan` với snapshot các tham số.
- **External:**
  - Emit `PlanCreated(planId, tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps, enabled)`.

---

### 1.3. updatePlan(planId, ...)

- **Mục đích:** Cập nhật saving plan hiện có.
- **Modifier:** `onlyOwner`.
- **Kiểm tra:**
  - `plans[planId].id != 0` → nếu 0 thì `InvalidPlan()`.
  - Các kiểm tra tương tự `createPlan` (tenorDays, aprBps, penalty, min/max).
- **Tác động:**
  - Ghi đè giá trị trong `SavingPlan` cho `planId`.
- **External:**
  - Emit `PlanUpdated(...)` với giá trị mới.
- **Ghi chú:**
  - Không ảnh hưởng tới các deposit đã mở (chúng snapshot tenor/apr/penalty từ thời điểm mở).

---

### 1.4. setFeeReceiver(newFeeReceiver)

- **Mục đích:** Cấu hình địa chỉ nhận tiền phạt rút trước hạn.
- **Modifier:** `onlyOwner`.
- **Tác động:**
  - Set `feeReceiver = newFeeReceiver` (có thể là `address(0)` để chuyển penalty về vault).
- **External:**
  - Emit `FeeReceiverUpdated(newFeeReceiver)`.

---

### 1.5. fundVault(amount)

- **Mục đích:** Nạp tiền vào vault để trả lãi.
- **Modifier:** `onlyOwner`.
- **Kiểm tra:**
  - `amount > 0` → nếu không `InvalidAmount()`.
- **Tác động:**
  - Gọi `token.safeTransferFrom(msg.sender, address(this), amount)` → owner phải `approve` trước.
  - Tăng `vaultBalance += amount`.
- **External:**
  - Emit `VaultFunded(msg.sender, amount)`.
- **Security:**
  - Dùng `SafeERC20` để xử lý ERC20 không chuẩn.

---

### 1.6. withdrawVault(amount)

- **Mục đích:** Rút bớt tiền khỏi vault (chỉ phần lãi đã nạp, không động chạm vào principal user theo logic).
- **Modifier:** `onlyOwner`.
- **Kiểm tra:**
  - `amount > 0`.
  - `amount <= vaultBalance` → nếu không `InsufficientVault()`.
- **Tác động:**
  - Giảm `vaultBalance -= amount`.
  - Gọi `token.safeTransfer(msg.sender, amount)`.
- **External:**
  - Emit `VaultWithdrawn(msg.sender, amount)`.

---

### 1.7. pause() / unpause()

- **Mục đích:** Bật/tắt trạng thái pause.
- **Modifier:** `onlyOwner`.
- **Tác động:**
  - Gọi `_pause()` / `_unpause()` từ `PausableUpgradeable`.
- **Ảnh hưởng:**
  - Các hàm `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit` đều gắn `whenNotPaused` → bị chặn khi paused.

---

### 1.8. openDeposit(planId, amount)

- **Mục đích:** User mở sổ tiết kiệm mới.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Input:** `planId`, `amount`.
- **Kiểm tra:**
  - Plan tồn tại (`plans[planId].id != 0`) → nếu không `InvalidPlan()`.
  - `plan.enabled == true` → nếu không `PlanDisabled()`.
  - `amount > 0` và `amount >= minDeposit` và (nếu `maxDeposit != 0` thì `amount <= maxDeposit`) → nếu không `InvalidAmount()`.
  - `activeDepositOf[msg.sender] == 0` → nếu không `AlreadyHasActiveDeposit()` (mỗi user chỉ 1 sổ active).
- **Tác động:**
  - `token.safeTransferFrom(msg.sender, address(this), amount)` → chuyển principal vào contract.
  - Tạo `depositId = nextDepositId++`.
  - Tính `startAt = block.timestamp`, `maturityAt = block.timestamp + tenorDays * 1 days`.
  - Ghi `deposits[depositId]` với snapshot: owner, planId, principal, tenorDays, aprBps, penaltyBps, startAt, maturityAt, status = `Active`.
  - Gọi `certificate.mintCertificate(msg.sender, depositId)` → mint NFT certificate tương ứng.
  - Set `activeDepositOf[msg.sender] = depositId`.
- **External:**
  - Emit `DepositOpened(depositId, msg.sender, planId, amount, maturityAt)`.
- **Security:**
  - `nonReentrant` bảo vệ trước reentrancy qua callback ERC20/ERC721 (dù `SafeERC20` đã giảm rủi ro).

---

### 1.9. withdrawAtMaturity(depositId)

- **Mục đích:** Tất toán đúng hạn, nhận principal + interest.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Input:** `depositId`.
- **Kiểm tra:**
  - `_requireDepositOwner(dep)` →
    - Dep tồn tại (id != 0 và owner != 0) nếu không `InvalidDeposit()`.
    - `msg.sender == dep.owner` nếu không `NotDepositOwner()`.
  - `dep.status == DepositStatus.Active` → nếu không `DepositNotActive()`.
  - `block.timestamp >= dep.maturityAt` → nếu không `NotMatured()`.
- **Tính toán:**
  - Gọi `_calculateInterest(dep.principal, dep.aprBps, dep.tenorDays)`.
  - Nếu `interest > vaultBalance` → `InsufficientVault()` (bảo vệ không chi quá vault).
- **Tác động:**
  - Giảm `vaultBalance -= interest`.
  - Set `dep.status = Withdrawn`.
  - Gọi `certificate.burnCertificate(depositId)` để burn NFT.
  - Tính `payout = principal + interest`.
  - Nếu `activeDepositOf[owner_] == depositId` → set về 0.
  - Gọi `token.safeTransfer(owner_, payout)`.
- **External:**
  - Emit `Withdrawn(depositId, owner_, principal, interest, false)`.

---

### 1.10. earlyWithdraw(depositId)

- **Mục đích:** Rút trước hạn, nhận principal trừ penalty.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Kiểm tra:**
  - `_requireDepositOwner(dep)` (giống trên).
  - `dep.status == Active`.
  - `block.timestamp < dep.maturityAt` → nếu không `AlreadyMatured()` (dùng hàm withdrawAtMaturity).
- **Tính toán:**
  - `penalty = principal * earlyWithdrawPenaltyBps / 10000`.
  - Nếu `penalty > principal` → clamp `penalty = principal`.
  - `userAmount = principal - penalty`.
- **Tác động:**
  - Set `dep.status = EarlyWithdrawn`.
  - Burn NFT: `certificate.burnCertificate(depositId)`.
  - Gửi `userAmount` cho owner.
  - Nếu `penalty > 0`:
    - Nếu `feeReceiver != address(0)` → gửi penalty cho feeReceiver.
    - Ngược lại → cộng penalty vào `vaultBalance`.
  - Nếu `activeDepositOf[owner_] == depositId` → set về 0.
- **External:**
  - Emit `Withdrawn(depositId, owner_, principal, 0, true)`.

---

### 1.11. renewDeposit(depositId, newPlanId)

- **Mục đích:** Gia hạn sổ sau khi đáo hạn, gộp gốc + lãi sang plan mới.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Kiểm tra:**
  - `_requireDepositOwner(dep)`.
  - `dep.status == Active`.
  - `block.timestamp >= dep.maturityAt` → nếu không `NotMatured()`.
  - `newPlan.id != 0` → nếu không `InvalidPlan()`.
  - `newPlan.enabled == true` → nếu không `PlanDisabled()`.
- **Tính toán:**
  - `interest = _calculateInterest(dep.principal, dep.aprBps, dep.tenorDays)`.
  - Nếu `interest > vaultBalance` → `InsufficientVault()`.
  - Giảm `vaultBalance -= interest`.
  - `newPrincipal = dep.principal + interest`.
  - Kiểm tra `newPrincipal` trong [minDeposit, maxDeposit] của newPlan.
- **Tác động:**
  - Set `dep.status = Renewed`.
  - Burn NFT cũ: `certificate.burnCertificate(depositId)`.
  - Tạo `newDepositId = nextDepositId++`.
  - Ghi `deposits[newDepositId]` với planId mới, principal = newPrincipal, tenor/apr/penalty từ newPlan.
  - Mint NFT mới: `certificate.mintCertificate(owner_, newDepositId)`.
  - Cập nhật `activeDepositOf[owner_] = newDepositId`.
- **External:**
  - Emit `Renewed(depositId, newDepositId, newPrincipal)`.

---

### 1.12. getMyActiveDepositId() / getActiveDepositId(user)

- **Mục đích:** Truy vấn sổ active.
- **Logic:**
  - Trả về giá trị từ mapping `activeDepositOf`.
- **Tác động:** Không thay đổi state.

---

### 1.13. _requireDepositOwner(dep)

- **Mục đích:** Internal helper đảm bảo deposit tồn tại và đúng owner.
- **Kiểm tra:**
  - Nếu `dep.id == 0` hoặc `dep.owner == address(0)` → `InvalidDeposit()`.
  - Nếu `msg.sender != dep.owner` → `NotDepositOwner()`.

---

### 1.14. _calculateInterest(principal, aprBps, tenorDays)

- **Mục đích:** Tính lãi simple interest theo requirement.
- **Công thức:**
  - Nếu bất kỳ tham số nào = 0 → trả về 0.
  - `tenorSeconds = tenorDays * 1 days`.
  - `yearInSeconds = 365 days`.
  - `interest = principal * aprBps * tenorSeconds / (yearInSeconds * 10000)`.
- **Tác động:** `pure`, không đọc/ghi state.

---

## 2. DepositCertificateUpgradeable

### 2.1. initialize(name_, symbol_, owner_)

- **Mục đích:** Khởi tạo ERC721 upgradable.
- **Kiểm tra:**
  - Nếu `owner_ == address(0)` → `ZeroAddress()`.
- **Tác động:**
  - `__ERC721_init(name_, symbol_)`.
  - `__Ownable_init(owner_)`.

---

### 2.2. setSavingBankCore(core)

- **Mục đích:** Chỉ định địa chỉ SavingBank core được phép mint/burn.
- **Modifier:** `onlyOwner`.
- **Kiểm tra:**
  - Nếu `core == address(0)` → `ZeroAddress()`.
- **Tác động:**
  - Set `savingBankCore = core`.
- **Security:**
  - Sau khi set, chỉ core mới gọi được `mintCertificate`/`burnCertificate`.

---

### 2.3. mintCertificate(to, depositId)

- **Mục đích:** Mint NFT certificate đại diện cho 1 deposit.
- **Modifier:** `onlySavingBankCore` (chỉ core).
- **Tác động:**
  - Gọi `_safeMint(to, depositId)` (tokenId == depositId).
- **External:**
  - Kích hoạt event ERC721 `Transfer(address(0), to, depositId)`.

---

### 2.4. burnCertificate(depositId)

- **Mục đích:** Burn NFT khi sổ kết thúc/gia hạn.
- **Modifier:** `onlySavingBankCore`.
- **Tác động:**
  - Gọi `_burn(depositId)`.

---

### 2.5. ownerDepositCertificateOf(tokenId)

- **Mục đích:** Cho core (hoặc client) truy vấn owner NFT qua interface IDepositCertificate.
- **Logic:**
  - Trả về `ownerOf(tokenId)` của ERC721.

---

## 3. SavingBankUpgradeableFactory

### 3.1. createSavingBank(token, name_, symbol_)

- **Mục đích:** Tạo 1 instance SavingBank (core + certificate) cho 1 ERC20 token.
- **Input:**
  - `token`: địa chỉ ERC20 underlying.
  - `name_`, `symbol_`: metadata cho ERC721 certificate.
- **Kiểm tra:**
  - `address(token) != address(0)` → nếu không revert `"TOKEN_ZERO"`.
- **Luồng xử lý:**
  1. Deploy `DepositCertificateUpgradeable cert = new DepositCertificateUpgradeable();`.
  2. Gọi `cert.initialize(name_, symbol_, msg.sender)`:
     - Owner của NFT collection là `msg.sender` (người tạo bank).
  3. Deploy `SavingBankCoreUpgradeable coreContract = new SavingBankCoreUpgradeable();`.
  4. Gọi `coreContract.initialize(address(token), address(cert), msg.sender)`:
     - Owner của core là `msg.sender`.
     - Gắn token ERC20 và contract certificate.
  5. Gọi `cert.setSavingBankCore(address(coreContract))` để chỉ định core có quyền mint/burn.
  6. Lưu thông tin vào `allBanks` và `userBanks[msg.sender]`, đánh dấu `isBankCore[core] = true`.
- **Output:**
  - Trả về `(core, certificate)` địa chỉ mới tạo.
- **External:**
  - Emit `SavingBankCreated(creator, core, certificate, token, name_, symbol_)`.

---

### 3.2. allBanksLength()

- **Mục đích:** Trả về số lượng bank đã tạo qua factory.
- **Logic:**
  - `return allBanks.length;`.

---

### 3.3. getUserBanks(user)

- **Mục đích:** Xem danh sách core bank do một user tạo.
- **Logic:**
  - `return userBanks[user];`.

---

### 3.4. getBankDeployment(index)

- **Mục đích:** Lấy metadata triển khai theo index.
- **Kiểm tra:**
  - `index < allBanks.length` → nếu không revert `"INDEX_OUT_OF_BOUNDS"`.
- **Logic:**
  - Lấy `BankDeployment storage b = allBanks[index]`.
  - Trả về `(b.core, b.certificate, b.token, b.creator)`.

---

## 4. Liên kết Security tổng thể

- **Ownership:**
  - SavingBankCoreUpgradeable: `OwnableUpgradeable` → admin cấu hình plan, vault, pause.
  - DepositCertificateUpgradeable: `OwnableUpgradeable`, nhưng quyền mint/burn được delegate cho core thông qua `savingBankCore`.
  - SavingBankUpgradeableFactory: `Ownable`, nhưng việc tạo bank không bị hạn chế (ai cũng có thể gọi), owner chỉ dùng cho quản trị factory nếu mở rộng.

- **Pausable:**
  - Chỉ tác động lên các action user (open, withdraw, renew), không ảnh hưởng đến view hoặc admin vault/plan.

- **ReentrancyGuard:**
  - Áp dụng cho các hàm chuyển tiền quan trọng trong core.

- **Interface-based Design:**
  - Core tương tác với NFT qua `IDepositCertificate`.
  - Hợp đồng bên ngoài chỉ cần depend vào `ISavingBankCore` thay vì implementation cụ thể.

Tài liệu này có thể dùng làm nền để bạn viết thêm tài liệu kỹ thuật, test case, hoặc mô tả sequence diagram cho từng luồng nghiệp vụ. 
