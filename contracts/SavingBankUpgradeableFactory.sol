// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SavingBankCoreUpgradeable} from "./SavingBankCoreUpgradeable.sol";
import {DepositCertificateUpgradeable} from "./DepositCertificateUpgradeable.sol";

/// @title SavingBankUpgradeableFactory
/// @notice Factory tạo ra cặp contract SavingBankCoreUpgradeable + DepositCertificateUpgradeable
/// cho từng ERC20 token, bám sát kiến trúc tách core logic và ERC721 certificate.
contract SavingBankUpgradeableFactory is Ownable {
    struct BankDeployment {
        address core;          // SavingBankCoreUpgradeable
        address certificate;   // DepositCertificateUpgradeable (ERC721)
        address token;         // ERC20 underlying
        address creator;       // Người tạo bank
    }

    /// @notice Danh sách tất cả bank (core + certificate) đã tạo.
    BankDeployment[] public allBanks;

    /// @notice Mapping creator -> danh sách địa chỉ core bank họ tạo.
    mapping(address => address[]) public userBanks;

    /// @notice Đánh dấu một địa chỉ có phải core bank được tạo bởi factory hay không.
    mapping(address => bool) public isBankCore;

    event SavingBankCreated(
        address indexed creator,
        address indexed core,
        address indexed certificate,
        address token,
        string name,
        string symbol
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Tạo mới một SavingBank upgradable cho một ERC20 token.
    /// @param token ERC20 token dùng làm stablecoin gửi tiết kiệm.
    /// @param name_ Tên collection ERC721 cho sổ tiết kiệm (NFT certificate).
    /// @param symbol_ Symbol collection ERC721.
    /// @return core Địa chỉ SavingBankCoreUpgradeable mới.
    /// @return certificate Địa chỉ DepositCertificateUpgradeable mới.
    function createSavingBank(
        IERC20 token,
        string memory name_,
        string memory symbol_
    ) external returns (address core, address certificate) {
        require(address(token) != address(0), "TOKEN_ZERO");

        // 1. Deploy certificate (ERC721 upgradable style, nhưng deploy trực tiếp implementation)
        DepositCertificateUpgradeable cert = new DepositCertificateUpgradeable();
        cert.initialize(name_, symbol_, msg.sender);

        // 2. Deploy core logic contract
        SavingBankCoreUpgradeable coreContract = new SavingBankCoreUpgradeable();
        coreContract.initialize(address(token), address(cert), msg.sender);

        // 3. Liên kết core <-> certificate: chỉ core được phép mint/burn NFT
        cert.setSavingBankCore(address(coreContract));

        core = address(coreContract);
        certificate = address(cert);

        allBanks.push(
            BankDeployment({
                core: core,
                certificate: certificate,
                token: address(token),
                creator: msg.sender
            })
        );

        userBanks[msg.sender].push(core);
        isBankCore[core] = true;

        emit SavingBankCreated(
            msg.sender,
            core,
            certificate,
            address(token),
            name_,
            symbol_
        );
    }

    /// @notice Số lượng bank đã được tạo qua factory.
    function allBanksLength() external view returns (uint256) {
        return allBanks.length;
    }

    /// @notice Lấy danh sách địa chỉ core bank do một user tạo.
    function getUserBanks(address user) external view returns (address[] memory) {
        return userBanks[user];
    }

    /// @notice Lấy thông tin triển khai bank theo index.
    function getBankDeployment(uint256 index)
        external
        view
        returns (
            address core,
            address certificate,
            address token,
            address creator
        )
    {
        require(index < allBanks.length, "INDEX_OUT_OF_BOUNDS");
        BankDeployment storage b = allBanks[index];
        return (b.core, b.certificate, b.token, b.creator);
    }
}
