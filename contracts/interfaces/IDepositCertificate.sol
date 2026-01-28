// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDepositCertificate
/// @notice Interface tối giản cho contract ERC721 đại diện sổ tiết kiệm.
interface IDepositCertificate {
    /// @notice Mint NFT certificate mới cho 1 deposit.
    /// @param to Địa chỉ nhận NFT.
    /// @param depositId Mã sổ tiết kiệm (sử dụng luôn làm tokenId).
    function mintCertificate(address to, uint256 depositId) external;

    /// @notice Burn NFT certificate khi sổ kết thúc hoặc gia hạn.
    /// @param depositId Mã sổ / tokenId cần burn.
    function burnCertificate(uint256 depositId) external;

    /// @notice Lấy owner hiện tại của 1 certificate.
    /// @param tokenId Token ID (bằng depositId).
    function ownerDepositCertificateOf(uint256 tokenId) external view returns (address);
}
