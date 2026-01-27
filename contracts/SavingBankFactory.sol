// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SavingBank} from "./SavingBank.sol";

/// @title SavingBankFactory
/// @notice Factory cho phép bất kỳ user nào tạo SavingBank riêng của mình.
/// Mỗi SavingBank mới sẽ được chuyển quyền owner cho caller (msg.sender).
contract SavingBankFactory is Ownable {
    /// @notice Danh sách tất cả SavingBank đã được tạo.
    address[] public allBanks;

    /// @notice Mapping từ creator tới danh sách SavingBank họ sở hữu.
    mapping(address => address[]) public userBanks;

    event SavingBankCreated(
        address indexed creator,
        address indexed bank,
        address indexed token,
        string name,
        string symbol
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Tạo một SavingBank mới dùng token và metadata NFT tuỳ chọn.
    /// @param token ERC20 token dùng làm stablecoin gửi tiết kiệm.
    /// @param name_ Tên collection ERC721 cho sổ tiết kiệm (NFT).
    /// @param symbol_ Symbol collection ERC721.
    /// @return bank Địa chỉ SavingBank mới tạo.
    function createSavingBank(
        IERC20 token,
        string memory name_,
        string memory symbol_
    ) external returns (address bank) {
        SavingBank newBank = new SavingBank(token, name_, symbol_);

        // Sau khi deploy, owner mặc định là factory → chuyển lại cho user gọi.
        newBank.transferOwnership(msg.sender);

        bank = address(newBank);

        allBanks.push(bank);
        userBanks[msg.sender].push(bank);

        emit SavingBankCreated(msg.sender, bank, address(token), name_, symbol_);
    }

    /// @notice Lấy số lượng SavingBank đã được tạo qua factory.
    function allBanksLength() external view returns (uint256) {
        return allBanks.length;
    }

    /// @notice Lấy danh sách SavingBank do một user tạo.
    function getUserBanks(address user) external view returns (address[] memory) {
        return userBanks[user];
    }
}
