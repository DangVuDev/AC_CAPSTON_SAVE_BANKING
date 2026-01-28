import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deploySavingBankFixture } from "./helpers/deploySavingBankFixture";
import hre from "hardhat";

const { ethers } = hre;

async function setupPlanAndVault() {
  const fixture = await loadFixture(deploySavingBankFixture);
  const { owner, user, core, token } = fixture;

  const tenorDays = 7;
  const aprBps = 800;
  const minDeposit = ethers.parseUnits("100", 18);
  const maxDeposit = 0n;
  const penaltyBps = 500;

  await core
    .connect(owner)
    .createPlan(tenorDays, aprBps, minDeposit, maxDeposit, penaltyBps, true);

  const vaultAmount = ethers.parseUnits("10000", 18);
  const coreAddress = await core.getAddress();
  await token.connect(owner).approve(coreAddress, vaultAmount);
  await core.connect(owner).fundVault(vaultAmount);

  return { ...fixture, minDeposit };
}

describe("SavingBankCoreUpgradeable - Early withdraw", function () {
  it("should early withdraw and send penalty to feeReceiver", async function () {
    const { owner, user, core, token, minDeposit } = await setupPlanAndVault();

    const coreAddress = await core.getAddress();
    await token.connect(user).approve(coreAddress, minDeposit);
    await core.connect(user).openDeposit(1, minDeposit);

    const depositId = await core.getMyActiveDepositId();
    const dep = await core.deposits(depositId);

    await time.increaseTo(dep.startAt + 1n);

    const ownerBalanceBefore = await token.balanceOf(owner.address);

    await core.connect(user).earlyWithdraw(depositId);

    const ownerBalanceAfter = await token.balanceOf(owner.address);

    expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);

    const activeAfter = await core.getMyActiveDepositId();
    expect(activeAfter).to.equal(0n);
  });
});
