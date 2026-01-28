// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockStablecoin
/// @notice Simple ERC20 token used as a mock stablecoin for testing the saving bank.
contract MockStablecoin is ERC20, Ownable {
    uint8 private immutable _customDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    /// @notice Mint new tokens to an address (only owner).
    /// @param to Recipient address.
    /// @param amount Amount of tokens to mint (in smallest units).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
