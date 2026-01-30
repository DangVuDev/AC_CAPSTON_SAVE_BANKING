
# PLAN – SavingBank v2: SOLID, Upgradable & Safe State



## 1. Tổng quan / Overview

- Áp dụng nguyên lý SOLID, tách rõ **SavingBank core logic**, **Deposit state**, **ERC721 certificate**, **vault/plan config**, **access control**.
- Tách hoàn toàn **state của deposit** ra khỏi SavingBank core để khi core có bug nghiêm trọng có thể bỏ hẳn contract core cũ, deploy core mới và **giữ nguyên toàn bộ dữ liệu deposit + NFT**.
- Thiết kế theo mô hình **upgradable core** (Transparent Proxy / UUPS) kết hợp với **các contract state ổn định (non-upgradable)** cho phần dữ liệu quan trọng.
- Củng cố bảo mật: ReentrancyGuard, Pausable, Ownable/AccessControl, SafeERC20, validate input chặt.
- Chuẩn bị hạ tầng test (unit test, scenario test) và doc để có thể mở rộng trong các sprint tiếp theo.

---


## 2. Kiến trúc tổng thể / High-Level Architecture


### 2.1. Các thành phần chính / Main Components

Đề xuất chia thành các phần sau:

1. **SavingBankUpgradeable (Upgradable)**
  - Contract upgradable (dùng `Initializable`, `OwnableUpgradeable`, `PausableUpgradeable`, `ReentrancyGuardUpgradeable`).
  - Chứa business logic chính:
    - Quản lý `SavingPlan` (create/update, enable/disable).
    - Tính toán lãi suất, penalty, logic open/withdraw/earlyWithdraw/renew.
    - Quản lý `vaultBalance`, `fundVault`, `withdrawVault`, `setFeeReceiver`.
  - **Không lưu `DepositInfo` bên trong**: chỉ tương tác với `DepositRegistry` để đọc/ghi state deposit.
  - Không kế thừa từ ERC721, chỉ gọi sang `DepositCertificate` để mint/burn NFT.

2. **DepositRegistry (Non-Upgradable, State Holder)**
  - Contract riêng chuyên lưu trữ dữ liệu deposit:
    - `struct DepositInfo { ... }` (principal, tenor, apr, penalty, start/maturity, status...).
    - `mapping(uint256 => DepositInfo) public deposits;`.
    - `mapping(address => uint256) public activeDepositOf;`.
    - `uint256 public nextDepositId;`.
  - Cấp quyền qua `AccessControl`/owner:
    - `BANK_ROLE`: chỉ các SavingBankCore được phép:
     - `createDeposit(...) returns (uint256 depositId)`.
     - `markWithdrawn`, `markEarlyWithdrawn`, `markRenewed` / `createRenewedDeposit`.
  - Có các hàm view cho phép core mới (sau này) đọc lại toàn bộ `DepositInfo` mà không cần migrate state.
  - Thiết kế **đơn giản, non-upgradable** để giảm rủi ro hỏng state quan trọng.

3. **DepositCertificateUpgradeable (ERC721 Certificate)**
  - ERC721 riêng chỉ quản lý NFT certificate cho deposit (tokenId = depositId).
  - Interface đơn giản cho SavingBankCore gọi:
    - `mintCertificate(address to, uint256 depositId)`.
    - `burnCertificate(uint256 depositId)`.
    - `ownerDepositCertificateOf(uint256 tokenId)`.
  - Quyền mint/burn giới hạn cho core thông qua `savingBankCore` hoặc `BANK_ROLE`.
  - NFT là “mặt nạ” đại diện cho deposit, còn dữ liệu chi tiết nằm ở `DepositRegistry`.

4. **SavingBankUpgradeableFactory (Factory)**
  - Factory triển khai cho mỗi ERC20 token một bộ contract:
    - `DepositRegistry` (state holder, non-upgradable).
    - `DepositCertificateUpgradeable` (ERC721).
    - `SavingBankUpgradeable` (upgradable core).
  - Lưu metadata các instance và transfer ownership thế hệ đầu tiên cho creator.
  - Khi cần, có thể deploy **core mới** trỏ tới cùng `DepositRegistry` + `DepositCertificate` để khắc phục bug, không mất dữ liệu.

5. **Libraries / Helpers** (nếu cần)
  - `InterestCalculator` library: hàm `_calculateInterest` tách riêng, dễ unit test.
  - Các struct/models có thể gom trong 1 file `SavingTypes.sol` nếu muốn.


### 2.2. Áp dụng SOLID / SOLID Principles

- **Single Responsibility:**
  - SavingBankCore chỉ xử lý nghiệp vụ saving (plan, vault, tính toán) + gọi sang registry/NFT.
  - DepositRegistry chỉ xử lý lưu trữ state deposit.
  - DepositCertificate chỉ xử lý ERC721 logic.
  - Factory chỉ xử lý việc deploy & wiring instance.
- **Open/Closed:**
  - SavingBankCore thiết kế để có thể mở rộng thêm tính năng (multi-deposit, rewards, v.v.) thông qua **upgrade/core mới** mà không sửa state cũ trong registry.
- **Liskov Substitution:**
  - Sử dụng interface chuẩn ERC20 / ERC721 / AccessControl; các implementation khác nhau (MockStablecoin, real stablecoin) thay thế được.
- **Interface Segregation:**
  - Định nghĩa interface nhỏ gọn cho DepositCertificate và DepositRegistry để SavingBankCore chỉ phụ thuộc đúng những hàm cần thiết.
- **Dependency Inversion:**
  - SavingBankCore phụ thuộc vào `IERC20`, `IDepositCertificate`, `IDepositRegistry` (interface), không phụ thuộc implementation cụ thể.


### 2.3. Upgradable Pattern & Data Safety / Mô hình nâng cấp & An toàn dữ liệu

- Sử dụng **OpenZeppelin Upgrades** cho core:
  - `SavingBankUpgradeable` dùng `initializer` thay cho constructor.
  - Deploy qua proxy (Transparent Proxy hoặc UUPS).
- **DepositRegistry & DepositCertificate**:
  - Ưu tiên thiết kế **non-upgradable**, đơn giản, code ít thay đổi để state an toàn lâu dài.
  - Khi cần phiên bản mới, có thể deploy registry mới cho bank mới, nhưng registry cũ vẫn giữ nguyên lịch sử.
- Khởi tạo core:
  - `initialize(address token, address registry, address certificate, address owner)` (hoặc tương đương) thay constructor.
  - Factory gọi `initialize` ngay sau deploy proxy.
- Khi core có bug nghiêm trọng:
  - Deploy core mới, cấp quyền `BANK_ROLE` trên `DepositRegistry` + quyền mint/burn trên `DepositCertificate`.
  - Người dùng chuyển sang tương tác với core mới, **không mất dữ liệu deposit/NFT**.


### 2.4. Security & Best Practices / Bảo mật & Thực tiễn tốt

- ReentrancyGuard ở tất cả hàm chuyển tiền quan trọng: open, withdraw, earlyWithdraw, renew, fundVault, withdrawVault.
- Sử dụng `SafeERC20` khi tương tác với ERC20 không chuẩn.
- Kiểm tra chặt chẽ input (tenorDays, aprBps, penaltyBps, amount, plan existence).
- Event đầy đủ cho mọi hành động admin & user.
- Sử dụng `AccessControl` cho `DepositRegistry` và (tuỳ nhu cầu) cho core nếu cần nhiều vai trò (PAUSER_ROLE, RATE_SETTER_ROLE...).
- Thiết kế storage layout cẩn thận cho upgradable core (không dùng immutable/constructor, không thay đổi thứ tự storage giữa các version).
- Giữ `DepositRegistry` và `DepositCertificate` **nhỏ gọn, ít logic phức tạp** để dễ audit và giảm bề mặt tấn công.

---


## 3. Kế hoạch triển khai & migration / Deployment & Migration Plan

### Ngày 1: Phân tích & Thiết kế Chi Tiết

**Mục tiêu:** Hoàn thiện design, chuẩn bị code skeleton.

- Rà soát lại requirement & USECASE để chốt behavior (không đổi business logic hiện tại, chỉ refactor kiến trúc).
- Thiết kế chi tiết contract:
  - Khai báo interface `IDepositCertificate`, `IDepositRegistry`.
  - Thiết kế storage layout cho `SavingBankUpgradeable` (plans, vaultBalance, feeReceiver, reference tới registry & certificate).
  - Thiết kế storage layout cho `DepositRegistry` (deposits, activeDepositOf, nextDepositId) – ưu tiên non-upgradable.
  - Thiết kế storage layout cho `DepositCertificateUpgradeable` (ERC721 + savingBankCore / BANK_ROLE).
- Thiết lập hạ tầng upgradable:
  - Cài `@openzeppelin/contracts-upgradeable` và plugin Hardhat upgrades.
  - Tạo file cấu hình / script deploy cơ bản cho proxy.
- Tạo skeleton contract:
  - `contracts/SavingBankUpgradeable.sol` với các struct plan, vault, event, storage, `initialize`.
  - `contracts/DepositRegistry.sol` với struct `DepositInfo`, mapping deposits, activeDepositOf, `BANK_ROLE`.
  - `contracts/DepositCertificateUpgradeable.sol` với ERC721 upgradable, `setSavingBankCore`.
  - Interfaces `contracts/interfaces/IDepositCertificate.sol`, `contracts/interfaces/IDepositRegistry.sol`.
- Cập nhật README tóm tắt kiến trúc mới (draft).

**Deliverables Ngày 1:**
- Code skeleton các contract upgradable, chưa cần full logic.
- Interface rõ ràng giữa SavingBankCore và DepositCertificate.

---

### Ngày 2: Implement Logic & Test Cơ Bản

**Mục tiêu:** Hoàn thiện logic, đảm bảo compile & test cơ bản pass.

- Implement đầy đủ logic trong `SavingBankUpgradeable`:
  - `createPlan`, `updatePlan` (kế thừa từ version hiện tại, điều chỉnh cho upgradable).
  - `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit` giữ nguyên công thức, **nhưng state deposit đọc/ghi qua `IDepositRegistry`**.
  - `fundVault`, `withdrawVault`, `setFeeReceiver`, `pause`, `unpause`.
- Implement `DepositRegistry`:
  - Hàm `createDeposit`, `markWithdrawn`, `markEarlyWithdrawn`, `createRenewedDeposit`/tương đương.
  - Quản lý `activeDepositOf` theo owner.
  - Chỉ cho phép gọi từ core (BANK_ROLE/owner).
- Implement `DepositCertificateUpgradeable`:
  - ERC721Upgradeable, `initialize(name, symbol, owner)`.
  - Hàm `setSavingBankCore`, `mintCertificate`, `burnCertificate` như hiện tại.
- Điều chỉnh SavingBankUpgradeableFactory:
  - Cho mỗi ERC20 token, deploy `DepositRegistry` + `DepositCertificateUpgradeable` + (proxy) `SavingBankUpgradeable`.
  - Gọi `initialize` tương ứng, set owner/roles cho creator, wiring registry + certificate vào core.
- Viết/điều chỉnh test:
  - Test mở deposit, tất toán, rút trước hạn, gia hạn với kiến trúc mới (core + registry + NFT).
  - Test factory tạo instance mới và quyền owner, registry wiring đúng.

**Deliverables Ngày 2:**
- Contracts compile được, test cơ bản chạy pass.
- Flow nghiệp vụ không đổi so với version hiện tại.

---

### Ngày 3: Security Hardening, Refine & Documentation

**Mục tiêu:** Củng cố security, tối ưu DX, hoàn thiện doc.

- Security & kiểm tra biên:
  - Rà lại tất cả require/revert, đảm bảo không có path reentrancy.
  - Đảm bảo không thể withdraw principal từ vault functions (chỉ lãi).
  - Kiểm tra xử lý khi vault không đủ lãi (revert rõ ràng).
- Bổ sung test nâng cao:
  - Test multi-user scenario.
  - Test trường hợp penalty = 0, penalty = 100%.
  - Test các path thất bại (plan disabled, amount ngoài min/max, vault thiếu lãi, ...).
- Documentation:
  - Cập nhật README/PLAN với kiến trúc mới, mô tả upgrade pattern.
  - Mô tả cách deploy & upgrade (Hardhat script, lệnh CLI).
- Chuẩn bị cho iteration tiếp theo:
  - Gợi ý hỗ trợ multi-deposit per user ở version sau (v2) nhờ upgradable design.

**Deliverables Ngày 3:**
- Bộ test bao phủ hầu hết use case quan trọng.
- Tài liệu triển khai và nâng cấp hoàn chỉnh.
- Code sẵn sàng cho internal review hoặc audit.

---


## 4. Ghi chú triển khai / Deployment Notes

- Phiên bản hiện tại (SavingBank.sol) vẫn giữ nguyên để tham chiếu.
- Refactor sang kiến trúc mới nên tạo **v2 folder** hoặc đặt tên *Upgradeable* rõ ràng để tránh nhầm lẫn.
- Trong quá trình migrate, cần xác định chiến lược data migration (nếu đã có deposit on-chain) – có thể nằm ngoài scope 3 ngày này nếu đây là capstone mới.
---

*Tài liệu này song ngữ (EN/VI) để dễ onboarding và review. Xem thêm USECASE.md và LOGIC_FUNCTION.md để biết chi tiết nghiệp vụ và luồng xử lý.*
