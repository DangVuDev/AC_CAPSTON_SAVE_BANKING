// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IDepositCertificate} from "./interfaces/IDepositCertificate.sol";

/// @title DepositCertificateUpgradeable
/// @notice ERC721 upgradable đại diện cho các sổ tiết kiệm (deposit certificates).
/// Mỗi depositId được map 1-1 với tokenId.
contract DepositCertificateUpgradeable is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    IDepositCertificate
{
    /// @notice Địa chỉ SavingBank core được phép mint/burn.
    address public savingBankCore;

    error NotSavingBankCore();
    error ZeroAddress();

    /// @dev Initializer thay cho constructor.
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_
    ) public initializer {
        if (owner_ == address(0)) {
            revert ZeroAddress();
        }
        __ERC721_init(name_, symbol_);
        __Ownable_init(owner_);
    }

    /// @notice Thiết lập địa chỉ SavingBank core được phép mint/burn.
    /// Có thể set một lần sau khi deploy; nếu muốn đổi cần review security.
    function setSavingBankCore(address core) external onlyOwner {
        if (core == address(0)) {
            revert ZeroAddress();
        }
        savingBankCore = core;
    }

    modifier onlySavingBankCore() {
        if (msg.sender != savingBankCore) {
            revert NotSavingBankCore();
        }
        _;
    }

    /// @inheritdoc IDepositCertificate
    function mintCertificate(address to, uint256 depositId)
        external
        override
        onlySavingBankCore
    {
        _safeMint(to, depositId);
    }

    /// @inheritdoc IDepositCertificate
    function burnCertificate(uint256 depositId)
        external
        override
        onlySavingBankCore
    {
        _burn(depositId);
    }

    function ownerDepositCertificateOf(uint256 tokenId) 
        external 
        view 
        override
        returns (address) {
        return ownerOf(tokenId);
    }
}