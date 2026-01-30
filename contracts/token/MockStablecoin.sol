// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockStablecoin
/// @notice Mock ERC20 stablecoin for testing Saving Bank system.
contract MockStablecoin is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint tokens to an address (only owner).
    /// @param to Recipient address
    /// @param amount Amount in smallest units (e.g. 100 * 10^6 for 100 USDC)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}