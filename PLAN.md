# PLAN - Refactor SavingBank theo SOLID, Upgradable & Security

## 1. Mục tiêu tổng thể

- Áp dụng nguyên lý SOLID, tách rõ **SavingBank core logic**, **ERC721 certificate**, **vault/plan config**, **access control**.
- Không gộp SavingBank core và ERC721 chung 1 contract như hiện tại → tách thành **NFT contract riêng** hoặc module riêng.
- Thiết kế lại hệ thống theo mô hình **upgradable contracts** (ví dụ Transparent Proxy hoặc UUPS) sử dụng OpenZeppelin.
- Củng cố bảo mật: ReentrancyGuard, Pausable, Ownable/AccessControl, kiểm tra overflow/underflow (Solidity 0.8+), validate input chặt.
- Chuẩn bị hạ tầng test (unit test, scenario test) và doc để có thể mở rộng trong các sprint tiếp theo.

---

## 2. Đề xuất kiến trúc mới (High-Level Design)

### 2.1. Contract & Module

Đề xuất chia thành các phần sau:

1. **SavingBankCore (Upgradable)**
   - Contract upgradable (dùng `Initializable`, `OwnableUpgradeable`, `PausableUpgradeable`, `ReentrancyGuardUpgradeable`).
   - Chứa business logic chính:
     - Quản lý `SavingPlan` (create/update, enable/disable).
     - Quản lý `DepositInfo` (principal, tenor, apr, penalty, start/maturity, status).
     - Các hàm nghiệp vụ: `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit`.
     - Quản lý `vaultBalance`, `fundVault`, `withdrawVault`, `setFeeReceiver`.
   - Không kế thừa từ ERC721, chỉ tương tác với certificate contract qua interface.

2. **DepositCertificate (ERC721 Upgradable hoặc Non-Upgradable)**
   - ERC721 riêng chỉ quản lý NFT certificate cho deposit.
   - Interface đơn giản cho SavingBankCore gọi:
     - `mintCertificate(address to, uint256 depositId)`.
     - `burnCertificate(uint256 depositId)`.
     - (Optionally) mapping `tokenId => depositId` nếu muốn khác nhau, hoặc set `tokenId == depositId` như hiện tại.
   - Quyền mint/burn giới hạn cho SavingBankCore bằng `onlyRole(MINTER_ROLE)` hoặc storage của owner.

3. **SavingBankFactory (Upgradable hoặc Non-Upgradable)**
   - Factory triển khai các proxy SavingBankCore + DepositCertificate mới cho mỗi ERC20 token.
   - Lưu metadata các instance và transfer ownership thế hệ đầu tiên cho creator.
   - Hỗ trợ upgrade sau này thông qua admin của proxy.

4. **Libraries / Helpers** (nếu cần)
   - `InterestCalculator` library: hàm `_calculateInterest` tách riêng, dễ unit test.
   - Các struct/models có thể gom trong 1 file `SavingTypes.sol` nếu muốn.

### 2.2. Áp dụng SOLID

- **Single Responsibility:**
  - SavingBankCore chỉ xử lý nghiệp vụ saving (plan, deposit, vault).
  - DepositCertificate chỉ xử lý ERC721 logic.
  - Factory chỉ xử lý việc deploy instance.
- **Open/Closed:**
  - SavingBankCore thiết kế để có thể mở rộng thêm tính năng (ví dụ multi-deposit per user, rewards) thông qua upgrade mà không sửa logic cũ.
- **Liskov Substitution:**
  - Sử dụng interface chuẩn ERC20 / ERC721 / AccessControl; các implementation khác nhau (MockStablecoin, real stablecoin) thay thế được.
- **Interface Segregation:**
  - Định nghĩa interface nhỏ gọn cho DepositCertificate (chỉ mint/burn/ownerOf) để SavingBankCore không phụ thuộc vào toàn bộ ERC721 interface.
- **Dependency Inversion:**
  - SavingBankCore phụ thuộc vào `IERC20` và `IDepositCertificate` (interface), không phụ thuộc implementation cụ thể.

### 2.3. Upgradable Pattern

- Sử dụng **OpenZeppelin Upgrades**:
  - Thêm package `@openzeppelin/contracts-upgradeable`.
  - Chuyển SavingBankCore sang `SavingBankCoreUpgradeable.sol` dùng `initializer` thay cho constructor.
  - Deploy qua proxy (Transparent Proxy hoặc UUPS); khuyến nghị Transparent Proxy cho đơn giản ban đầu.
- Khởi tạo:
  - `initialize(address token, address certificate, address owner)` thay constructor.
  - Factory gọi `initialize` ngay sau deploy proxy.

### 2.4. Security & Best Practices

- ReentrancyGuard ở tất cả hàm chuyển tiền quan trọng: open, withdraw, earlyWithdraw, renew, fundVault, withdrawVault.
- Sử dụng `SafeERC20` khi tương tác với ERC20 không chuẩn.
- Kiểm tra chặt chẽ input (tenorDays, aprBps, penaltyBps, amount, plan existence).
- Event đầy đủ cho mọi hành động admin & user.
- Sử dụng `AccessControl` (thay vì chỉ Ownable) nếu sau này cần nhiều vai trò (PAUSER_ROLE, RATE_SETTER_ROLE...).
- Thiết kế storage layout cẩn thận cho upgradable (không dùng immutable/constructor, không thay đổi thứ tự storage giữa các version).

---

## 3. Kế hoạch triển khai 3 ngày

### Ngày 1: Phân tích & Thiết kế Chi Tiết

**Mục tiêu:** Hoàn thiện design, chuẩn bị code skeleton.

- Rà soát lại requirement & USECASE để chốt behavior (không đổi business logic hiện tại, chỉ refactor kiến trúc).
- Thiết kế chi tiết contract:
  - Khai báo interface `IDepositCertificate`.
  - Thiết kế storage layout cho `SavingBankCoreUpgradeable` (plans, deposits, activeDepositOf, vaultBalance,...).
  - Thiết kế storage layout cho `DepositCertificateUpgradeable`.
- Thiết lập hạ tầng upgradable:
  - Cài `@openzeppelin/contracts-upgradeable` và plugin Hardhat upgrades.
  - Tạo file cấu hình / script deploy cơ bản cho proxy.
- Tạo skeleton contract:
  - `contracts/SavingBankCoreUpgradeable.sol` với các struct, event, storage, `initialize`.
  - `contracts/DepositCertificateUpgradeable.sol` với ERC721 upgradable, mapping phù hợp.
  - Interface `contracts/interfaces/IDepositCertificate.sol`.
- Cập nhật README tóm tắt kiến trúc mới (draft).

**Deliverables Ngày 1:**
- Code skeleton các contract upgradable, chưa cần full logic.
- Interface rõ ràng giữa SavingBankCore và DepositCertificate.

---

### Ngày 2: Implement Logic & Test Cơ Bản

**Mục tiêu:** Hoàn thiện logic, đảm bảo compile & test cơ bản pass.

- Implement đầy đủ logic trong `SavingBankCoreUpgradeable`:
  - `createPlan`, `updatePlan` (copy từ SavingBank hiện tại, điều chỉnh cho upgradable và tách interest lib nếu dùng).
  - `openDeposit`, `withdrawAtMaturity`, `earlyWithdraw`, `renewDeposit` giữ nguyên công thức, chỉ đổi cách mint/burn NFT sang gọi `IDepositCertificate`.
  - `fundVault`, `withdrawVault`, `setFeeReceiver`, `pause`, `unpause`.
- Implement `DepositCertificateUpgradeable`:
  - ERC721Upgradeable, `initialize(name, symbol, owner)`.
  - Role cho SavingBankCore (ví dụ MINTER_ROLE/BURNER_ROLE) hoặc lưu `savingBankCore` address và giới hạn mint/burn.
- Điều chỉnh SavingBankFactory:
  - Cho mỗi ERC20 token, deploy proxy `SavingBankCoreUpgradeable` + proxy `DepositCertificateUpgradeable` (hoặc non-upgradeable nếu muốn đơn giản hoá NFT).
  - Gọi `initialize` tương ứng, set owner/roles cho creator.
- Viết/điều chỉnh test:
  - Test mở deposit, tất toán, rút trước hạn, gia hạn với kiến trúc mới.
  - Test factory tạo instance mới và quyền owner.

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

## 4. Ghi chú triển khai

- Phiên bản hiện tại (SavingBank.sol) vẫn giữ nguyên để tham chiếu.
- Refactor sang kiến trúc mới nên tạo **v2 folder** hoặc đặt tên *Upgradeable* rõ ràng để tránh nhầm lẫn.
- Trong quá trình migrate, cần xác định chiến lược data migration (nếu đã có deposit on-chain) – có thể nằm ngoài scope 3 ngày này nếu đây là capstone mới.
