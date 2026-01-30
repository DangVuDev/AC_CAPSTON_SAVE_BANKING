// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Vault
/// @notice Contract riêng quản lý toàn bộ tiền gốc (principal) và lãi (interest) của hệ thống tiết kiệm.
/// Chỉ owner (admin) và SavingBank core được phép nạp/rút tiền.
/// Tiền không được giữ ở SavingBank, mà chuyển thẳng vào Vault.
contract Vault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable savingBankCore;

    uint256 public vaultBalance; // Tổng số dư trong vault (principal + interest + penalty)

    event VaultFunded(address indexed from, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event PenaltyReceived(address indexed from, uint256 amount);

    error OnlySavingBankOrOwner();
    error InsufficientVaultBalance();
    error InvalidAmount();
    error ZeroAddress();

    modifier onlySavingBankOrOwner() {
        if (msg.sender != savingBankCore && msg.sender != owner()) {
            revert OnlySavingBankOrOwner();
        }
        _;
    }

    constructor(
        address _token,
        address _savingBankCore,
        address _initialOwner
    ) Ownable(_initialOwner) {
        if (_token == address(0) || _savingBankCore == address(0) || _initialOwner == address(0)) {
            revert ZeroAddress();
        }
        token = IERC20(_token);
        savingBankCore = _savingBankCore;
    }

    /// @notice Nạp tiền vào vault (principal hoặc interest từ SavingBank)
    /// @param amount Số lượng token cần nạp
    function fund(uint256 amount) external onlySavingBankOrOwner {
        if (amount == 0) revert InvalidAmount();

        token.safeTransferFrom(msg.sender, address(this), amount);
        vaultBalance += amount;

        emit VaultFunded(msg.sender, amount);
    }

    /// @notice Rút tiền từ vault về một địa chỉ bất kỳ (user hoặc feeReceiver)
    /// @param amount Số lượng token cần rút
    /// @param to Địa chỉ nhận tiền
    function withdrawTo(uint256 amount, address to) external onlySavingBankOrOwner {
        if (amount == 0) revert InvalidAmount();
        if (amount > vaultBalance) revert InsufficientVaultBalance();
        if (to == address(0)) revert ZeroAddress();

        vaultBalance -= amount;
        token.safeTransfer(to, amount);

        emit VaultWithdrawn(to, amount);
    }

    /// @notice Rút tiền về chính caller (dùng khi SavingBank cần interest để tính toán renew)
    /// @param amount Số lượng token cần rút
    function withdraw(uint256 amount) external onlySavingBankOrOwner {
        if (amount == 0) revert InvalidAmount();
        if (amount > vaultBalance) revert InsufficientVaultBalance();
        if (msg.sender == address(0)) revert ZeroAddress();

        vaultBalance -= amount;
        token.safeTransfer(msg.sender, amount);

        emit VaultWithdrawn(msg.sender, amount);
    }

    /// @notice Nhận penalty từ earlyWithdraw (từ SavingBank hoặc feeReceiver)
    /// @dev Nếu feeReceiver là address(0), penalty sẽ được giữ lại trong vault
    function receivePenalty(uint256 amount) external onlySavingBankOrOwner {
        if (amount == 0) return; // Không revert để tránh block tx

        token.safeTransferFrom(msg.sender, address(this), amount);
        vaultBalance += amount;

        emit PenaltyReceived(msg.sender, amount);
    }

    /// @notice Xem số dư hiện tại trong vault
    function getVaultBalance() external view returns (uint256) {
        return vaultBalance;
    }

    /// @notice Xem token address
    function getToken() external view returns (address) {
        return address(token);
    }

    /// @notice Xem địa chỉ SavingBank core
    function getSavingBankCore() external view returns (address) {
        return savingBankCore;
    }
}