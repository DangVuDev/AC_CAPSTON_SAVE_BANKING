// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDepositCertificate} from "./interfaces/IDepositCertificate.sol";
import {ISavingBankCore} from "./interfaces/ISavingBankCore.sol";

/// @title SavingBankCoreUpgradeable
/// @notice Core logic sản phẩm tiết kiệm có kỳ hạn, tách riêng khỏi ERC721 certificate.
/// Implement các interface nhỏ: ISavingPlanManager, IVaultManager, IDepositManager thông qua ISavingBankCore.
contract SavingBankCoreUpgradeable is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    ISavingBankCore
{
    using SafeERC20 for IERC20;

    /// @dev Maximum APR in basis points (e.g. 5000 = 50%).
    uint32 public constant MAX_APR_BPS = 5000;

    /// @dev Maximum penalty in basis points (10000 = 100%).
    uint32 public constant MAX_PENALTY_BPS = 10000;

    IERC20 public token;
    IDepositCertificate public certificate;

    /// @notice Address receiving early-withdrawal penalties (can be zero address => penalties stay in vault).
    address public feeReceiver;

    /// @notice Balance of the liquidity vault used to pay interest.
    uint256 public vaultBalance;

    uint256 public nextPlanId;
    uint256 public nextDepositId;

    struct SavingPlan {
        uint256 id;
        uint32 tenorDays;
        uint32 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit; // 0 = unlimited
        uint32 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    enum DepositStatus {
        Active,
        Withdrawn,
        EarlyWithdrawn,
        Renewed,
        Cancelled
    }

    struct DepositInfo {
        uint256 id;
        uint256 planId;
        address owner;
        uint256 principal;
        uint32 tenorDays; // fixed at creation
        uint32 aprBps; // fixed at creation
        uint32 earlyWithdrawPenaltyBps; // fixed at creation
        uint64 startAt;
        uint64 maturityAt;
        DepositStatus status;
    }

    mapping(uint256 => SavingPlan) public plans;
    mapping(uint256 => DepositInfo) public deposits;
    mapping(address => uint256) public activeDepositOf;

   
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
    error AlreadyHasActiveDeposit();

    // ---------------------------------------------------------------------
    // Initializer
    // ---------------------------------------------------------------------

    /// @notice Khởi tạo contract upgradable, thay cho constructor.
    /// @param token_ Địa chỉ ERC20 dùng làm stablecoin gửi tiết kiệm.
    /// @param certificate_ Địa chỉ ERC721 certificate contract.
    /// @param owner_ Owner của SavingBank core.
    function initialize(
        address token_,
        address certificate_,
        address owner_
    ) external initializer {
        if (token_ == address(0) || certificate_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }

        __Ownable_init(owner_);
        __Pausable_init();
        __ReentrancyGuard_init();

        token = IERC20(token_);
        certificate = IDepositCertificate(certificate_);
        feeReceiver = owner_;

        nextPlanId = 1;
        nextDepositId = 1;
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
    ) external onlyOwner {
        if (tenorDays == 0) {
            revert InvalidParameters();
        }
        if (aprBps > MAX_APR_BPS) {
            revert InvalidParameters();
        }
        if (earlyWithdrawPenaltyBps > MAX_PENALTY_BPS) {
            revert InvalidParameters();
        }
        if (maxDeposit != 0 && maxDeposit < minDeposit) {
            revert InvalidParameters();
        }

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
    ) external onlyOwner {
        SavingPlan storage plan = plans[planId];
        if (plan.id == 0) {
            revert InvalidPlan();
        }
        if (tenorDays == 0) {
            revert InvalidParameters();
        }
        if (aprBps > MAX_APR_BPS) {
            revert InvalidParameters();
        }
        if (earlyWithdrawPenaltyBps > MAX_PENALTY_BPS) {
            revert InvalidParameters();
        }
        if (maxDeposit != 0 && maxDeposit < minDeposit) {
            revert InvalidParameters();
        }

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

    function setFeeReceiver(address newFeeReceiver) external onlyOwner {
        feeReceiver = newFeeReceiver;
        emit FeeReceiverUpdated(newFeeReceiver);
    }

    /// @notice Fund the interest vault; tokens must be approved beforehand.
    function fundVault(uint256 amount) external onlyOwner {
        if (amount == 0) {
            revert InvalidAmount();
        }
        token.safeTransferFrom(msg.sender, address(this), amount);
        vaultBalance += amount;
        emit VaultFunded(msg.sender, amount);
    }

    /// @notice Withdraw from the interest vault (cannot withdraw user principals).
    function withdrawVault(uint256 amount) external onlyOwner {
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (amount > vaultBalance) {
            revert InsufficientVault();
        }
        vaultBalance -= amount;
        token.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
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
        returns (uint256 depositId)
    {
        SavingPlan storage plan = plans[planId];
        if (plan.id == 0) {
            revert InvalidPlan();
        }
        if (!plan.enabled) {
            revert PlanDisabled();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (amount < plan.minDeposit) {
            revert InvalidAmount();
        }
        if (plan.maxDeposit != 0 && amount > plan.maxDeposit) {
            revert InvalidAmount();
        }

        if (activeDepositOf[msg.sender] != 0) {
            revert AlreadyHasActiveDeposit();
        }

        token.safeTransferFrom(msg.sender, address(this), amount);

        depositId = nextDepositId++;

        uint64 startAt = uint64(block.timestamp);
        uint64 maturityAt = uint64(block.timestamp + uint64(plan.tenorDays) * 1 days);

        deposits[depositId] = DepositInfo({
            id: depositId,
            planId: planId,
            owner: msg.sender,
            principal: amount,
            tenorDays: plan.tenorDays,
            aprBps: plan.aprBps,
            earlyWithdrawPenaltyBps: plan.earlyWithdrawPenaltyBps,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active
        });

        certificate.mintCertificate(msg.sender, depositId);

        activeDepositOf[msg.sender] = depositId;

        emit DepositOpened(depositId, msg.sender, planId, amount, maturityAt);
    }

    /// @notice Withdraw at or after maturity, receiving principal + interest.
    function withdrawAtMaturity(uint256 depositId)
        external
        whenNotPaused
        nonReentrant
    {
        DepositInfo storage dep = deposits[depositId];
        _requireDepositOwner(dep);

        if (dep.status != DepositStatus.Active) {
            revert DepositNotActive();
        }
        if (block.timestamp < dep.maturityAt) {
            revert NotMatured();
        }

        uint256 interest = _calculateInterest(
            dep.principal,
            dep.aprBps,
            dep.tenorDays
        );

        if (interest > vaultBalance) {
            revert InsufficientVault();
        }

        vaultBalance -= interest;
        dep.status = DepositStatus.Withdrawn;

        certificate.burnCertificate(depositId);

        address owner_ = dep.owner;
        uint256 principal = dep.principal;
        uint256 payout = principal + interest;

        if (activeDepositOf[owner_] == depositId) {
            activeDepositOf[owner_] = 0;
        }

        token.safeTransfer(owner_, payout);

        emit Withdrawn(depositId, owner_, principal, interest, false);
    }

    /// @notice Early withdraw before maturity, receiving principal minus penalty.
    function earlyWithdraw(uint256 depositId)
        external
        whenNotPaused
        nonReentrant
    {
        DepositInfo storage dep = deposits[depositId];
        _requireDepositOwner(dep);

        if (dep.status != DepositStatus.Active) {
            revert DepositNotActive();
        }
        if (block.timestamp >= dep.maturityAt) {
            revert AlreadyMatured();
        }

        uint256 penalty = (dep.principal * dep.earlyWithdrawPenaltyBps) / 10000;
        if (penalty > dep.principal) {
            penalty = dep.principal;
        }
        uint256 userAmount = dep.principal - penalty;

        dep.status = DepositStatus.EarlyWithdrawn;
        certificate.burnCertificate(depositId);

        address owner_ = dep.owner;
        token.safeTransfer(owner_, userAmount);

        if (penalty > 0) {
            if (feeReceiver != address(0)) {
                token.safeTransfer(feeReceiver, penalty);
            } else {
                // keep penalty inside contract and treat as part of vault
                vaultBalance += penalty;
            }
        }

        if (activeDepositOf[owner_] == depositId) {
            activeDepositOf[owner_] = 0;
        }

        emit Withdrawn(depositId, owner_, dep.principal, 0, true);
    }

    /// @notice Renew a matured deposit into a new plan, rolling over principal + interest.
    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 newDepositId)
    {
        DepositInfo storage dep = deposits[depositId];
        _requireDepositOwner(dep);

        if (dep.status != DepositStatus.Active) {
            revert DepositNotActive();
        }
        if (block.timestamp < dep.maturityAt) {
            revert NotMatured();
        }

        SavingPlan storage newPlan = plans[newPlanId];
        if (newPlan.id == 0) {
            revert InvalidPlan();
        }
        if (!newPlan.enabled) {
            revert PlanDisabled();
        }

        uint256 interest = _calculateInterest(
            dep.principal,
            dep.aprBps,
            dep.tenorDays
        );

        if (interest > vaultBalance) {
            revert InsufficientVault();
        }

        vaultBalance -= interest;

        uint256 newPrincipal = dep.principal + interest;

        if (newPrincipal < newPlan.minDeposit) {
            revert InvalidAmount();
        }
        if (newPlan.maxDeposit != 0 && newPrincipal > newPlan.maxDeposit) {
            revert InvalidAmount();
        }

        dep.status = DepositStatus.Renewed;
        certificate.burnCertificate(depositId);

        address owner_ = dep.owner;

        newDepositId = nextDepositId++;
        uint64 startAt = uint64(block.timestamp);
        uint64 maturityAt = uint64(block.timestamp + uint64(newPlan.tenorDays) * 1 days);

        deposits[newDepositId] = DepositInfo({
            id: newDepositId,
            planId: newPlanId,
            owner: owner_,
            principal: newPrincipal,
            tenorDays: newPlan.tenorDays,
            aprBps: newPlan.aprBps,
            earlyWithdrawPenaltyBps: newPlan.earlyWithdrawPenaltyBps,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active
        });

        certificate.mintCertificate(owner_, newDepositId);

        activeDepositOf[owner_] = newDepositId;

        emit Renewed(depositId, newDepositId, newPrincipal);
    }

    /// @notice Get the active deposit ID of the caller (0 if none).
    function getMyActiveDepositId() external view returns (uint256) {
        return activeDepositOf[msg.sender];
    }

    /// @notice Get the active deposit ID of a user (0 if none).
    function getActiveDepositId(address user) external view returns (uint256) {
        return activeDepositOf[user];
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireDepositOwner(DepositInfo storage dep) internal view {
        if (dep.id == 0 || dep.owner == address(0)) {
            revert InvalidDeposit();
        }
        if (msg.sender != dep.owner) {
            revert NotDepositOwner();
        }
    }

    function _calculateInterest(
        uint256 principal,
        uint32 aprBps,
        uint32 tenorDays
    ) internal pure returns (uint256) {
        if (principal == 0 || aprBps == 0 || tenorDays == 0) {
            return 0;
        }
        uint256 tenorSeconds = uint256(tenorDays) * 1 days;
        uint256 yearInSeconds = 365 days;
        // interest = principal * aprBps * tenorSeconds / (365 days * 10000)
        return (principal * aprBps * tenorSeconds) / (yearInSeconds * 10000);
    }
}
