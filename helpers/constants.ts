export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEFAULT_PLAN = {
  tenorDays: 30,
  aprBps: 500,
  minDeposit: ethers.utils.parseUnits("100", 6),
  maxDeposit: 0,
  penaltyBps: 1000,
  enabled: true,
};
export const ERROR_MESSAGES = {
  INVALID_AMOUNT: "InvalidAmount",
  PLAN_DISABLED: "PlanDisabled",
  NOT_MATURED: "NotMatured",
};