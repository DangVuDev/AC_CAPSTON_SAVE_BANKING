// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IVaultManager
/// @notice Interface cho nghiệp vụ quản lý vault lãi suất và fee receiver.
interface IVaultManager {
    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event FeeReceiverUpdated(address indexed newFeeReceiver);

    function fundVault(uint256 amount) external;

    function withdrawVault(uint256 amount) external;

    function setFeeReceiver(address newFeeReceiver) external;

    function feeReceiver() external view returns (address);

    function vaultBalance() external view returns (uint256);
}
