// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {SavingBankUpgradeable} from "./SavingBankUpgradeable.sol";
import {DepositRegistry} from "./DepositRegistry.sol";
import {DepositCertificateUpgradeable} from "./DepositCertificateUpgradeable.sol";

/// @dev Interface tối giản để đọc owner từ các contract Ownable/OwnableUpgradeable.
    interface IOwnableLike {
        function owner() external view returns (address);
    }

/// @title SavingBankUpgradeableFactory
/// @notice Factory tạo ra cặp contract SavingBankCoreUpgradeable + DepositCertificateUpgradeable
/// cho từng ERC20 token, bám sát kiến trúc tách core logic và ERC721 certificate.
contract SavingBankUpgradeableFactory is Ownable {
    struct BankDeployment {
        address core;          // SavingBankCoreUpgradeable
        address registry;      // DepositRegistry (state holder)
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
        address indexed registry,
        address certificate,
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
    /// @return registry Địa chỉ DepositRegistry mới.
    /// @return certificate Địa chỉ DepositCertificateUpgradeable mới.
    function createSavingBank(
        IERC20 token,
        string memory name_,
        string memory symbol_
    ) external returns (address core, address registry, address certificate) {
        require(address(token) != address(0), "TOKEN_ZERO");

        // 1. Deploy registry lưu state deposit, owner = factory để cấu hình quyền core.
        DepositRegistry reg = new DepositRegistry();

        // 2. Deploy certificate (ERC721). Tạm thời set owner = factory để cấu hình, sau đó chuyển lại cho creator.
        DepositCertificateUpgradeable cert = new DepositCertificateUpgradeable();
        cert.initialize(name_, symbol_, address(this));

        // 3. Deploy core logic contract
        SavingBankUpgradeable coreContract = new SavingBankUpgradeable();
        coreContract.initialize(address(token), address(reg), address(cert), msg.sender);

        // 4. Liên kết core với registry & certificate
        reg.setBankCore(address(coreContract), true);
        cert.setSavingBankCore(address(coreContract));

        // 5. Chuyển quyền owner certificate + registry lại cho creator để họ quản trị
        cert.transferOwnership(msg.sender);
        reg.transferOwnership(msg.sender);

        core = address(coreContract);
        registry = address(reg);
        certificate = address(cert);

        allBanks.push(
            BankDeployment({
                core: core,
                registry: registry,
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
            registry,
            certificate,
            address(token),
            name_,
            symbol_
        );
    }

    /// @notice Tạo core SavingBank mới tái sử dụng lại registry + NFT certificate cũ.
    /// @dev Dùng trong trường hợp muốn thay thế core nhưng vẫn giữ nguyên state và NFT.
    /// Người gọi PHẢI là owner của cả registry và certificate, và sau khi tạo xong
    /// cần tự gọi:
    ///  - DepositRegistry(registry).setBankCore(core, true)
    ///  - DepositCertificateUpgradeable(certificate).setSavingBankCore(core)
    /// để gán quyền cho core mới.
    /// @param token ERC20 token dùng làm stablecoin.
    /// @param registry Địa chỉ DepositRegistry đã tồn tại.
    /// @param certificate Địa chỉ DepositCertificateUpgradeable (NFT) đã tồn tại.
    /// @return core Địa chỉ SavingBankCoreUpgradeable mới.
    function createSavingBankWithExistingState(
        IERC20 token,
        address registry,
        address certificate
    ) external returns (address core) {
        require(address(token) != address(0), "TOKEN_ZERO");
        require(registry != address(0), "REG_ZERO");
        require(certificate != address(0), "CERT_ZERO");

        // Đảm bảo caller là owner của cả registry và certificate
        require(IOwnableLike(registry).owner() == msg.sender, "NOT_REG_OWNER");
        require(IOwnableLike(certificate).owner() == msg.sender, "NOT_CERT_OWNER");

        // Deploy core mới, trỏ tới registry + certificate cũ
        SavingBankUpgradeable coreContract = new SavingBankUpgradeable();
        coreContract.initialize(address(token), registry, certificate, msg.sender);

        core = address(coreContract);

        allBanks.push(
            BankDeployment({
                core: core,
                registry: registry,
                certificate: certificate,
                token: address(token),
                creator: msg.sender
            })
        );

        userBanks[msg.sender].push(core);
        isBankCore[core] = true;

        // Lấy lại name/symbol từ NFT cũ để emit event cho thuận tiện theo dõi.
        string memory name_ = DepositCertificateUpgradeable(certificate).name();
        string memory symbol_ = DepositCertificateUpgradeable(certificate).symbol();

        emit SavingBankCreated(
            msg.sender,
            core,
            registry,
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
        returns (address core, address registry, address token, address creator)
    {
        require(index < allBanks.length, "INDEX_OUT_OF_BOUNDS");
        BankDeployment storage b = allBanks[index];
        return (b.core, b.registry, b.token, b.creator);
    }
}