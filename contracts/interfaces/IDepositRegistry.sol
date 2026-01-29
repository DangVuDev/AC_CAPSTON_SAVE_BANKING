// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDepositRegistry
/// @notice Interface cho contract lưu trữ toàn bộ state Deposit, tách biệt khỏi SavingBank core.
interface IDepositRegistry {
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
        uint32 tenorDays;
        uint32 aprBps;
        uint32 earlyWithdrawPenaltyBps;
        uint64 startAt;
        uint64 maturityAt;
        DepositStatus status;
    }

    function nextDepositId() external view returns (uint256);

    function deposits(uint256 depositId) external view returns (DepositInfo memory);

    function activeDepositOf(address user) external view returns (uint256[] memory);

    function getActiveDepositId(address user) external view returns (uint256[] memory);

    function createDeposit(
        address owner,
        uint256 planId,
        uint256 principal,
        uint32 tenorDays,
        uint32 aprBps,
        uint32 earlyWithdrawPenaltyBps,
        uint64 startAt,
        uint64 maturityAt
    ) external returns (uint256 depositId);

    function markWithdrawn(uint256 depositId) external;

    function markEarlyWithdrawn(uint256 depositId) external;

    function markRenewed(uint256 depositId) external;

    function createRenewedDeposit(
        address owner,
        uint256 newPlanId,
        uint256 newPrincipal,
        uint32 tenorDays,
        uint32 aprBps,
        uint32 earlyWithdrawPenaltyBps,
        uint64 startAt,
        uint64 maturityAt
    ) external returns (uint256 newDepositId);
}
