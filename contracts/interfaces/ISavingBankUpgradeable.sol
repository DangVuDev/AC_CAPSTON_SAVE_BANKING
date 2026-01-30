// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISavingPlanManager} from "./ISavingPlanManager.sol";
import {IVaultManager} from "./IVaultManager.sol";
import {IDepositManager} from "./IDepositManager.sol";

/// @title ISavingBankUpgradeable
/// @notice Interface tổng hợp cho SavingBank bank, tách nhỏ theo từng nhóm nghiệp vụ.
interface ISavingBankUpgradeable is ISavingPlanManager, IVaultManager, IDepositManager {}
