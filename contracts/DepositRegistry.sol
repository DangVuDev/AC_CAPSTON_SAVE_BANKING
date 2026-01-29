// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IDepositRegistry} from "./interfaces/IDepositRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract DepositRegistry is IDepositRegistry, Ownable {
    uint256 public _nextDepositId = 1;

    mapping(uint256 => DepositInfo) private _deposits;
    mapping(address => bool) public isBankCore;

    // Hỗ trợ nhiều sổ active cho 1 user
    mapping(address => uint256[]) private _activeDepositsOf;

    error NotAuthorizedCore();
    error InvalidOwner();
    error InvalidDeposit();
    error DepositNotActive();

    modifier onlyCore() {
        if (!isBankCore[msg.sender]) revert NotAuthorizedCore();
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setBankCore(address core, bool allowed) external onlyOwner {
        isBankCore[core] = allowed;
    }

    // ---------------------------------------------------------------------
    // Views - Implement đầy đủ từ interface
    // ---------------------------------------------------------------------

    function nextDepositId() external view override returns (uint256) {
        return _nextDepositId;
    }

    function deposits(uint256 depositId) external view override returns (DepositInfo memory) {
        return _deposits[depositId];
    }

    function activeDepositOf(address user) external view override returns (uint256[] memory) {
        return _activeDepositsOf[user];
    }

    function getActiveDepositId(address user) external view override returns (uint256[] memory) {
        return _activeDepositsOf[user];
    }

    // ---------------------------------------------------------------------
    // Core write functions - Implement đầy đủ
    // ---------------------------------------------------------------------

    function createDeposit(
        address owner,
        uint256 planId,
        uint256 principal,
        uint32 tenorDays,
        uint32 aprBps,
        uint32 earlyWithdrawPenaltyBps,
        uint64 startAt,
        uint64 maturityAt
    ) external override onlyCore returns (uint256 depositId) {
        if (owner == address(0)) revert InvalidOwner();

        depositId = _nextDepositId++;
        _deposits[depositId] = DepositInfo({
            id: depositId,
            planId: planId,
            owner: owner,
            principal: principal,
            tenorDays: tenorDays,
            aprBps: aprBps,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active
        });

        // Thêm vào danh sách active của user
        _activeDepositsOf[owner].push(depositId);
    }

    function markWithdrawn(uint256 depositId) external override onlyCore {
        DepositInfo storage dep = _deposits[depositId];
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (dep.status != DepositStatus.Active) revert DepositNotActive();

        dep.status = DepositStatus.Withdrawn;
        _removeFromActive(dep.owner, depositId);
    }

    function markEarlyWithdrawn(uint256 depositId) external override onlyCore {
        DepositInfo storage dep = _deposits[depositId];
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (dep.status != DepositStatus.Active) revert DepositNotActive();

        dep.status = DepositStatus.EarlyWithdrawn;
        _removeFromActive(dep.owner, depositId);
    }

    function markRenewed(uint256 depositId) external override onlyCore {
        DepositInfo storage dep = _deposits[depositId];
        if (dep.id == 0 || dep.owner == address(0)) revert InvalidDeposit();
        if (dep.status != DepositStatus.Active) revert DepositNotActive();

        dep.status = DepositStatus.Renewed;
        _removeFromActive(dep.owner, depositId);
    }

    function createRenewedDeposit(
        address owner,
        uint256 newPlanId,
        uint256 newPrincipal,
        uint32 tenorDays,
        uint32 aprBps,
        uint32 earlyWithdrawPenaltyBps,
        uint64 startAt,
        uint64 maturityAt
    ) external override onlyCore returns (uint256 newDepositId) {
        if (owner == address(0)) revert InvalidOwner();

        newDepositId = _nextDepositId++;
        _deposits[newDepositId] = DepositInfo({
            id: newDepositId,
            planId: newPlanId,
            owner: owner,
            principal: newPrincipal,
            tenorDays: tenorDays,
            aprBps: aprBps,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            startAt: startAt,
            maturityAt: maturityAt,
            status: DepositStatus.Active
        });

        // Thêm sổ mới vào danh sách active
        _activeDepositsOf[owner].push(newDepositId);
    }

    // Helper private: xóa depositId khỏi mảng active (efficient swap & pop)
    function _removeFromActive(address user, uint256 depositId) private {
        uint256[] storage ids = _activeDepositsOf[user];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == depositId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }
    }
}