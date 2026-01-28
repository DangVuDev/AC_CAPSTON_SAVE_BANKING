// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISavingPlanManager
/// @notice Interface cho các nghiệp vụ quản lý Saving Plan.
interface ISavingPlanManager {
    event PlanCreated(
        uint256 indexed planId,
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    );

    event PlanUpdated(
        uint256 indexed planId,
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    );

    function createPlan(
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    ) external;

    function updatePlan(
        uint256 planId,
        uint32 tenorDays,
        uint32 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint32 earlyWithdrawPenaltyBps,
        bool enabled
    ) external;
}
