// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDepositCertificate} from "./interfaces/IDepositCertificate.sol";
import {IDepositRegistry} from "./interfaces/IDepositRegistry.sol";
import {ISavingBankUpgradeable} from "./interfaces/ISavingBankUpgradeable.sol";
import {Vault} from "./Vault.sol"; // Import contract Vault riêng

/// @title SavingBankUpgradeable
/// @notice Core logic sản phẩm tiết kiệm có kỳ hạn, tách riêng vault ra contract Vault.
/// Chỉ owner và Vault mới được phép nạp/rút tiền lãi.
contract SavingBankUpgradeable is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ISavingBankUpgradeable
{
    using SafeERC20 for IERC20;

    /// @dev Maximum APR in basis points (e.g. 5000 = 50%).
    uint32 public constant MAX_APR_BPS = 5000;

    /// @dev Maximum penalty in basis points (10000 = 100%).
    uint32 public constant MAX_PENALTY_BPS = 10000;

    IERC20 public token;
    IDepositRegistry public registry;
    IDepositCertificate public certificate;
    Vault public vault; // ← Vault riêng thay vì uint256 vaultBalance

    /// @notice Address receiving early-withdrawal penalties (can be zero address => penalties stay in vault).
    address public feeReceiver;

    uint256 public nextPlanId;

    struct SavingPlan {
        uint256 id;
        uint32 tenorDays;
        uint32 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit; // 0 = unlimited
        uint32 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    mapping(uint256 => SavingPlan) public plans;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error InvalidPlan();
    error InvalidDeposit();
    error PlanDisabled();
    error InvalidAmount();
    error InvalidParameters();
    error NotDepositOwner();
    error DepositNotActive();
    error NotMatured();
    error AlreadyMatured();
    error InsufficientVault();

    // ---------------------------------------------------------------------
    // Initializer
    // ---------------------------------------------------------------------

    /// @notice Khởi tạo contract upgradable.
    /// @param token_ Địa chỉ ERC20 dùng làm stablecoin.
    /// @param registry_ Địa chỉ DepositRegistry lưu state deposit.
    /// @param certificate_ Địa chỉ ERC721 certificate contract.
    /// @param owner_ Owner của SavingBank core.
    function initialize(
        address token_,
        address registry_,
        address certificate_,
        address owner_
    ) external initializer {
        if (token_ == address(0) || registry_ == address(0) || certificate_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }

        __Ownable_init(owner_);
        __Pausable_init();
        __ReentrancyGuard_init();

        token = IERC20(token_);
        registry = IDepositRegistry(registry_);
        certificate = IDepositCertificate(certificate_);

        Vault vault_ = new Vault(address(token), address(this), owner_);
        vault = Vault(vault_);

        feeReceiver = owner_;

        nextPlanId = 1;
    }

    // ---------------------------------------------------------------------
    // Admin: Saving Plans
    // ---------------------------------------------------------------------

    function createPlan(
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    ) external override onlyOwner {
        if (tenorDays == 0) revert InvalidParameters();
        if (aprBps > MAX_APR_BPS) revert InvalidParameters();
        if (earlyWithdrawPenaltyBps > MAX_PENALTY_BPS) revert InvalidParameters();
        if (maxDeposit != 0 && maxDeposit < minDeposit) revert InvalidParameters();

        uint256 planId = nextPlanId++;

        plans[planId] = SavingPlan({
            id: planId,
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: enabled
        });

        emit PlanCreated(
            planId,
            tenorDays,
            aprBps,
            minDeposit,
            maxDeposit,
            earlyWithdrawPenaltyBps,
            enabled
        );
    }

    function updatePlan(
        uint256 planId,
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    ) external override onlyOwner {
        SavingPlan storage plan = plans[planId];
        if (plan.id == 0) revert InvalidPlan();

        if (tenorDays == 0) revert InvalidParameters();
        if (aprBps > MAX_APR_BPS) revert InvalidParameters();
        if (earlyWithdrawPenaltyBps > MAX_PENALTY_BPS) revert InvalidParameters();
        if (maxDeposit != 0 && maxDeposit < minDeposit) revert InvalidParameters();

        plan.tenorDays = tenorDays;
        plan.aprBps = aprBps;
        plan.minDeposit = minDeposit;
        plan.maxDeposit = maxDeposit;
        plan.earlyWithdrawPenaltyBps = earlyWithdrawPenaltyBps;
        plan.enabled = enabled;

        emit PlanUpdated(
            planId,
            tenorDays,
            aprBps,
            minDeposit,
            maxDeposit,
            earlyWithdrawPenaltyBps,
            enabled
        );
    }

    // ---------------------------------------------------------------------
    // Admin: Vault & Fee Receiver
    // ---------------------------------------------------------------------

    function setFeeReceiver(address newFeeReceiver) external override onlyOwner {
        feeReceiver = newFeeReceiver;
        emit FeeReceiverUpdated(newFeeReceiver);
    }

    /// @notice Nạp tiền vào vault (chỉ owner)
    function fundVault(uint256 amount) external override onlyOwner {
        if (amount == 0) revert InvalidAmount();
        token.safeTransferFrom(msg.sender, address(vault), amount);
        vault.fund(amount);
        emit VaultFunded(msg.sender, amount);
    }

    /// @notice Rút tiền từ vault (chỉ owner)
    function withdrawVault(uint256 amount) external override onlyOwner {
        if (amount == 0) revert InvalidAmount();
        vault.withdrawTo(amount, msg.sender);
        emit VaultWithdrawn(msg.sender, amount);
    }

    function getFeeReceiver() external view override returns (address) {
        return feeReceiver;
    }

    function getVaultBalance() external view override returns (uint256) {
        return vault.getVaultBalance();
    }

    // ---------------------------------------------------------------------
    // Admin: Pause
    // ---------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------

    function openDeposit(uint256 planId, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        override
        returns (uint256 depositId)
    {
        SavingPlan storage plan = plans[planId];
        if (plan.id == 0) revert InvalidPlan();
        if (!plan.enabled) revert PlanDisabled();
        if (amount == 0) revert InvalidAmount();
        if (amount < plan.minDeposit) revert InvalidAmount();
        if (plan.maxDeposit != 0 && amount > plan.maxDeposit) revert InvalidAmount();

        // 1. Chuyển tiền từ user vào SavingBank (transit ngắn)
        token.safeTransferFrom(address(this), address(vault), amount);

        uint64 startAt = uint64(block.timestamp);
        uint64 maturityAt = uint64(block.timestamp + uint64(plan.tenorDays) * 1 days);

        depositId = registry.createDeposit(
            msg.sender,
            planId,
            amount,
            plan.tenorDays,
            plan.aprBps,
            plan.earlyWithdrawPenaltyBps,
            startAt,
            maturityAt
        );

        certificate.mintCertificate(msg.sender, depositId);

        emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt);
    }

    function withdrawAtMaturity(uint256 depositId)
        external
        override
        whenNotPaused
        nonReentrant
    {
        IDepositRegistry.DepositInfo memory dep = registry.deposits(depositId);
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (msg.sender != dep.owner) revert NotDepositOwner();
        if (dep.status != IDepositRegistry.DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp < dep.maturityAt) revert NotMatured();

        uint256 interest = _calculateInterest(dep.principal, dep.aprBps, dep.tenorDays);

        // Vault trả thẳng principal + interest về user (không transit qua SavingBank)
        vault.withdrawTo(dep.principal + interest, msg.sender);

        registry.markWithdrawn(depositId);
        certificate.burnCertificate(depositId);

        emit Withdrawn(depositId, msg.sender, dep.principal, interest, false);
    }

    function earlyWithdraw(uint256 depositId)
        external
        override
        whenNotPaused
        nonReentrant
    {
        IDepositRegistry.DepositInfo memory dep = registry.deposits(depositId);
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (msg.sender != dep.owner) revert NotDepositOwner();
        if (dep.status != IDepositRegistry.DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp >= dep.maturityAt) revert AlreadyMatured();

        uint256 penalty = (dep.principal * dep.earlyWithdrawPenaltyBps) / 10000;
        if (penalty > dep.principal) penalty = dep.principal;

        uint256 userAmount = dep.principal - penalty;

        // Vault trả thẳng userAmount về user
        vault.withdrawTo(userAmount, msg.sender);

        // Phạt (penalty) giữ ở Vault hoặc chuyển feeReceiver
        if (penalty > 0) {
            if (feeReceiver != address(0)) {
                vault.withdrawTo(penalty, feeReceiver);
            }
            // Nếu không có feeReceiver, penalty vẫn ở Vault (tăng vaultBalance)
        }

        registry.markEarlyWithdrawn(depositId);
        certificate.burnCertificate(depositId);

        emit Withdrawn(depositId, msg.sender, dep.principal, 0, true);
    }

    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        whenNotPaused
        nonReentrant
        override
        returns (uint256 newDepositId)
    {
        IDepositRegistry.DepositInfo memory dep = registry.deposits(depositId);
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (msg.sender != dep.owner) revert NotDepositOwner();
        if (dep.status != IDepositRegistry.DepositStatus.Active) revert DepositNotActive();
        if (block.timestamp < dep.maturityAt) revert NotMatured();

        SavingPlan storage newPlan = plans[newPlanId];
        if (newPlan.id == 0) revert InvalidPlan();
        if (!newPlan.enabled) revert PlanDisabled();

        uint256 interest = _calculateInterest(dep.principal, dep.aprBps, dep.tenorDays);

        uint256 newPrincipal = dep.principal + interest;

        if (newPrincipal < newPlan.minDeposit) revert InvalidAmount();
        if (newPlan.maxDeposit != 0 && newPrincipal > newPlan.maxDeposit) revert InvalidAmount();

        address owner_ = dep.owner;
        uint64 startAt = uint64(block.timestamp);
        uint64 maturityAt = uint64(block.timestamp + uint64(newPlan.tenorDays) * 1 days);

        registry.markRenewed(depositId);
        certificate.burnCertificate(depositId);

        newDepositId = registry.createRenewedDeposit(
            owner_,
            newPlanId,
            newPrincipal,
            newPlan.tenorDays,
            newPlan.aprBps,
            newPlan.earlyWithdrawPenaltyBps,
            startAt,
            maturityAt
        );

        certificate.mintCertificate(owner_, newDepositId);

        emit Renewed(depositId, newDepositId, newPrincipal);
    }

    /// @notice Get all active deposit IDs of the caller (empty array if none).
    function getMyActiveDepositId() external view override returns (uint256[] memory) {
        return registry.getActiveDepositId(msg.sender);
    }

    /// @notice Get all active deposit IDs of a user (empty array if none).
    function getActiveDepositId(address user) external view override returns (uint256[] memory) {
        return registry.getActiveDepositId(user);
    }

    function _calculateInterest(
        uint256 principal,
        uint32 aprBps,
        uint32 tenorDays
    ) internal pure returns (uint256) {
        if (principal == 0 || aprBps == 0 || tenorDays == 0) return 0;
        uint256 tenorSeconds = uint256(tenorDays) * 1 days;
        uint256 yearInSeconds = 365 days;
        return (principal * aprBps * tenorSeconds) / (yearInSeconds * 10000);
    }
}