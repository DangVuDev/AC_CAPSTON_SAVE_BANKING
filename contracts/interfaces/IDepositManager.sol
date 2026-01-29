// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDepositManager
/// @notice Interface cho các nghiệp vụ mở/tất toán/gia hạn sổ tiết kiệm.
interface IDepositManager {
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint64 maturityAt
    );

    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );

    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal
    );

    function openDeposit(uint256 planId, uint256 amount)
        external
        returns (uint256 depositId);

    function withdrawAtMaturity(uint256 depositId) external;

    function earlyWithdraw(uint256 depositId) external;

    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        returns (uint256 newDepositId);

    function getMyActiveDepositId() external view returns (uint256[] memory);

    function getActiveDepositId(address user) external view returns (uint256[] memory);
}
