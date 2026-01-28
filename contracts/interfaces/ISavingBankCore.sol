// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISavingPlanManager} from "./ISavingPlanManager.sol";
import {IVaultManager} from "./IVaultManager.sol";
import {IDepositManager} from "./IDepositManager.sol";

/// @title ISavingBankCore
/// @notice Interface tổng hợp cho SavingBank core, tách nhỏ theo từng nhóm nghiệp vụ.
interface ISavingBankCore is ISavingPlanManager, IVaultManager, IDepositManager {}
