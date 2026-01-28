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

describe("SavingBankCoreUpgradeable - Renew deposit", function () {
  it("should renew deposit at maturity into new plan", async function () {
    const { owner, user, core, token, minDeposit } = await setupPlanAndVault();

    const coreAddress = await core.getAddress();
    await token.connect(user).approve(coreAddress, minDeposit);
    await core.connect(user).openDeposit(1, minDeposit);

    const depositId = await core.getMyActiveDepositId();
    const dep = await core.deposits(depositId);

    const newTenorDays = 30;
    const newAprBps = 1000;
    const newMin = ethers.parseUnits("50", 18);
    const newMax = 0n;
    const newPenalty = 300;

    await core
      .connect(owner)
      .createPlan(newTenorDays, newAprBps, newMin, newMax, newPenalty, true);

    await time.increaseTo(dep.maturityAt);

    await core.connect(user).renewDeposit(depositId, 2);

    const newActiveId = await core.getMyActiveDepositId();
    expect(newActiveId).to.equal(2n);

    const newDep = await core.deposits(newActiveId);
    expect(newDep.planId).to.equal(2n);
    expect(newDep.owner).to.equal(user.address);
    expect(newDep.principal).to.be.greaterThan(dep.principal);
  });
});
