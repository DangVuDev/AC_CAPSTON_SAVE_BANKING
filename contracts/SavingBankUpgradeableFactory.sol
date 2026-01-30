// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SavingBankUpgradeable} from "./SavingBankUpgradeable.sol";
import {DepositRegistry} from "./DepositRegistry.sol";
import {DepositCertificateUpgradeable} from "./DepositCertificateUpgradeable.sol";

interface IOwnableLike {
    function owner() external view returns (address);
}

contract SavingBankUpgradeableFactory is Ownable {
    mapping(address => address[]) public userBanks;

    event SavingBankCreated(
        address indexed creator,
        address indexed bank,
        address indexed registry,
        address certificate,
        address token,
        string name,
        string symbol
    );

    constructor() Ownable(msg.sender) {}

    function createSavingBank(
        IERC20 token,
        string memory name_,
        string memory symbol_
    ) external returns (address bank, address registry, address certificate) {
        require(address(token) != address(0), "TOKEN_ZERO");

        DepositRegistry reg = new DepositRegistry();

        DepositCertificateUpgradeable cert = new DepositCertificateUpgradeable();
        cert.initialize(name_, symbol_, address(this));

        SavingBankUpgradeable savingBank = new SavingBankUpgradeable();
        savingBank.initialize(address(token), address(reg), address(cert), msg.sender);

        reg.setBankExecutable(address(savingBank), true);
        cert.setBankExecutable(address(savingBank));

        cert.transferOwnership(msg.sender);
        reg.transferOwnership(msg.sender);

        bank = address(savingBank);
        registry = address(reg);
        certificate = address(cert);

        userBanks[msg.sender].push(bank);

        emit SavingBankCreated(
            msg.sender,
            bank,
            registry,
            certificate,
            address(token),
            name_,
            symbol_
        );
    }

    function createSavingBankWithExistingState(
        IERC20 token,
        address registry,
        address certificate
    ) external returns (address bank) {
        require(address(token) != address(0), "TOKEN_ZERO");
        require(registry != address(0), "REG_ZERO");
        require(certificate != address(0), "CERT_ZERO");

        require(IOwnableLike(registry).owner() == msg.sender, "NOT_REG_OWNER");
        require(IOwnableLike(certificate).owner() == msg.sender, "NOT_CERT_OWNER");

        SavingBankUpgradeable savingBank = new SavingBankUpgradeable();
        savingBank.initialize(address(token), registry, certificate, msg.sender);

        bank = address(savingBank);

        userBanks[msg.sender].push(bank);

        string memory name_ = DepositCertificateUpgradeable(certificate).name();
        string memory symbol_ = DepositCertificateUpgradeable(certificate).symbol();

        emit SavingBankCreated(
            msg.sender,
            bank,
            registry,
            certificate,
            address(token),
            name_,
            symbol_
        );
    }

    function getUserBanks(address user) external view returns (address[] memory) {
        return userBanks[user];
    }
}