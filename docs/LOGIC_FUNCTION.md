
# LOGIC_FUNCTION – Phân tích chi tiết luồng xử lý (v2)


Tài liệu này mô tả chi tiết logic bên trong các hàm quan trọng của kiến trúc **SavingBank v2**:
- SavingBankUpgradeable (core logic, upgradable)
- DepositRegistry (state holder cho deposit, non-upgradable)
- DepositCertificateUpgradeable (ERC721 certificate)
- SavingBankUpgradeableFactory (factory)

Tập trung vào:
- Input / output
- Kiểm tra (require/revert)
- Tác động lên storage
- Tương tác external (token, registry, NFT, event)
- Security (Pausable, ReentrancyGuard, Ownable/AccessControl)

---

## 1. SavingBankUpgradeable (Core logic)

> Lưu ý: Core **không còn lưu DepositInfo trực tiếp**; mọi state deposit nằm trong DepositRegistry.

### 1.1. initialize(token_, registry_, certificate_, owner_)

- **Mục đích:** Khởi tạo contract upgradable, thay cho constructor.
- **Input:**
  - `token_`: địa chỉ ERC20 underlying.
  - `registry_`: địa chỉ DepositRegistry (IDepositRegistry).
  - `certificate_`: địa chỉ contract ERC721 chứng chỉ gửi tiết kiệm (IDepositCertificate).
  - `owner_`: owner ban đầu của core (admin bank).
- **Kiểm tra:**
  - Nếu bất kỳ input nào là `address(0)` → `ZeroAddress()`.
- **Tác động:**
  - Gọi `__Ownable_init(owner_)`, `__Pausable_init()`, `__ReentrancyGuard_init()`.
  - Lưu `token = IERC20(token_)`.
  - Lưu `registry = IDepositRegistry(registry_)`.
  - Lưu `certificate = IDepositCertificate(certificate_)`.
  - Set `feeReceiver = owner_`.
  - Khởi tạo `nextPlanId = 1`.
- **Security:**
  - Chỉ được gọi 1 lần (modifier `initializer` của OZ).

---

### 1.2. createPlan(...) / updatePlan(...)

Như version hiện tại (v1), nhưng **không liên quan trực tiếp tới DepositRegistry**:

- `createPlan`:
  - `onlyOwner`.
  - Validate tenorDays, aprBps, penaltyBps, min/max.
  - Tăng `nextPlanId` và ghi `plans[planId]`.
  - Emit `PlanCreated`.
- `updatePlan`:
  - `onlyOwner`, plan phải tồn tại.
  - Validate tương tự.
  - Cập nhật struct và emit `PlanUpdated`.

Các plan chỉ ảnh hưởng tới **deposit mở mới / renew**, deposit cũ dùng snapshot.

---

### 1.3. setFeeReceiver / fundVault / withdrawVault / pause / unpause

Giữ nguyên như v1, core quản lý:

- `feeReceiver`, `vaultBalance`.
- Nạp/rút vault bằng `SafeERC20`, validate input, event `VaultFunded`, `VaultWithdrawn`.
- `pause()` / `unpause()` ảnh hưởng tới các hàm user (open/withdraw/renew).

Không chạm tới DepositRegistry.

---

### 1.4. openDeposit(planId, amount)

- **Mục đích:** User mở sổ tiết kiệm mới.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Input:** `planId`, `amount`.
- **Kiểm tra:**
  - Plan tồn tại, enabled.
  - `amount` trong min/max của plan.
  - `registry.getActiveDepositId(msg.sender) == 0` (hoặc logic multi-deposit nếu sau này đổi) → nếu không `AlreadyHasActiveDeposit()`.
- **Luồng xử lý:**
  1. `token.safeTransferFrom(msg.sender, address(this), amount)` → chuyển principal vào core.
  2. Tính `startAt = block.timestamp`, `maturityAt = block.timestamp + tenorDays * 1 days`.
  3. Gọi `registry.createDeposit(msg.sender, planId, amount, tenorDays, aprBps, earlyPenaltyBps, startAt, maturityAt)` → nhận `depositId`.
  4. Gọi `certificate.mintCertificate(msg.sender, depositId)`.
  5. Emit `DepositOpened(depositId, msg.sender, planId, amount, maturityAt)`.
- **State:**
  - Dữ liệu deposit nằm trong **registry**, core chỉ giữ vault, plans.

---

### 1.5. withdrawAtMaturity(depositId)

- **Mục đích:** Tất toán đúng hạn, nhận principal + interest.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Luồng xử lý:**
  1. Đọc `DepositInfo dep = registry.getDeposit(depositId)`.
  2. Validate:
     - Dep tồn tại, `dep.owner == msg.sender`.
     - `dep.status == Active`.
     - `block.timestamp >= dep.maturityAt`.
  3. Tính `interest = _calculateInterest(dep.principal, dep.aprBps, dep.tenorDays)`.
  4. Nếu `interest > vaultBalance` → `InsufficientVault()`.
  5. Giảm `vaultBalance -= interest`.
  6. Gọi `registry.markWithdrawn(depositId)` (update status + activeDepositOf bên trong registry).
  7. Gọi `certificate.burnCertificate(depositId)`.
  8. Tính `payout = principal + interest` và chuyển cho user.
  9. Emit `Withdrawn(depositId, owner_, principal, interest, false)`.

---

### 1.6. earlyWithdraw(depositId)

- **Mục đích:** Rút trước hạn, nhận principal trừ penalty.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Luồng xử lý:**
  1. Đọc `dep` từ registry, validate owner, status Active, `block.timestamp < maturityAt`.
  2. Tính penalty & clamp: `penalty = min(principal, principal * penaltyBps / 10000)`.
  3. `userAmount = principal - penalty`.
  4. Gọi `registry.markEarlyWithdrawn(depositId)`.
  5. Burn NFT.
  6. Gửi `userAmount` cho owner.
  7. Xử lý penalty:
     - Nếu `feeReceiver != address(0)`: gửi penalty tới feeReceiver.
     - Ngược lại: cộng penalty vào `vaultBalance`.
  8. Emit `Withdrawn(depositId, owner_, principal, 0, true)`.

---

### 1.7. renewDeposit(depositId, newPlanId)

- **Mục đích:** Gia hạn sổ sau khi đáo hạn, gộp gốc + lãi sang plan mới.
- **Modifiers:** `whenNotPaused`, `nonReentrant`.
- **Luồng xử lý:**
  1. Đọc `dep` từ registry, validate owner, status Active, `block.timestamp >= maturityAt`.
  2. Đọc `newPlan` từ core, validate tồn tại & enabled.
  3. Tính `interest` và kiểm tra `vaultBalance`.
  4. `newPrincipal = principal + interest`, validate theo min/max newPlan.
  5. Giảm `vaultBalance -= interest`.
  6. Gọi `registry.markRenewedAndCreateNew(depId, newPlanId, newPrincipal, newTenor, ...)` (hoặc 2 hàm tách: markRenewed + createDeposit mới).
  7. Burn NFT cũ, mint NFT mới với `newDepositId`.
  8. Emit `Renewed(oldDepositId, newDepositId, newPrincipal)`.

---

### 1.8. getMyActiveDepositId() / getActiveDepositId(user)

- **Mục đích:** Truy vấn sổ active.
- **Logic:** Core gọi thẳng sang registry:
  - `registry.getActiveDepositId(msg.sender)`.
  - `registry.getActiveDepositId(user)`.

---

### 1.9. _calculateInterest(principal, aprBps, tenorDays)

Giữ nguyên như v1:

- Nếu bất kỳ tham số nào = 0 → trả về 0.
- `tenorSeconds = tenorDays * 1 days`.
- `yearInSeconds = 365 days`.
- `interest = principal * aprBps * tenorSeconds / (yearInSeconds * 10000)`.

Hàm `pure`, không đọc/ghi state.

---

## 2. DepositRegistry (State Holder)

### 2.1. Storage chính

- `struct DepositInfo { id, planId, owner, principal, tenorDays, aprBps, earlyWithdrawPenaltyBps, startAt, maturityAt, status }`.
- `mapping(uint256 => DepositInfo) public deposits;`.
- `mapping(address => uint256) public activeDepositOf;`.
- `uint256 public nextDepositId;`.
- `bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");` (nếu dùng AccessControl).

Registry không nắm logic tính tiền; chỉ là nơi lưu trữ state và enforce quyền ghi.

### 2.2. createDeposit(...)

- **Mục đích:** Tạo deposit mới.
- **Modifier:** `onlyRole(BANK_ROLE)` hoặc `onlyBank`.
- **Input:** owner, planId, principal, tenorDays, aprBps, penaltyBps, startAt, maturityAt.
- **Kiểm tra:**
  - `owner != address(0)`.
  - `activeDepositOf[owner] == 0` (tuỳ business rule).
- **Tác động:**
  - `depositId = nextDepositId++`.
  - Ghi `deposits[depositId]` với status = Active.
  - `activeDepositOf[owner] = depositId`.

### 2.3. markWithdrawn / markEarlyWithdrawn / markRenewed

- **Mục đích:** Cập nhật trạng thái deposit khi core đã xử lý dòng tiền.
- **Modifier:** chỉ core được gọi.
- **markWithdrawn(depositId):**
  - Kiểm tra tồn tại + status Active.
  - Set status = Withdrawn.
  - Nếu `activeDepositOf[owner] == depositId` → set về 0.
- **markEarlyWithdrawn(depositId):**
  - Tương tự, set status = EarlyWithdrawn và clear active.
- **markRenewedAndCreateNew(...) hoặc tách:**
  - Old deposit: set status = Renewed, clear active.
  - New deposit: tạo bản ghi mới, set active cho owner.

### 2.4. getDeposit / getActiveDepositId

- View function cho phép core và client đọc dữ liệu deposit.
- Không có side-effect.

---

## 3. DepositCertificateUpgradeable (NFT)

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
  3. Deploy `SavingBankUpgradeable coreContract = new SavingBankUpgradeable();`.
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
  - SavingBankUpgradeable: `OwnableUpgradeable` → admin cấu hình plan, vault, pause.
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
