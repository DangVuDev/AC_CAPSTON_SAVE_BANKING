import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { deploySavingBankFixture } from "./helpers/deploySavingBankFixture";
import hre from "hardhat";

const { ethers } = hre;

async function setupPlanAndVault() {
  const fixture = await loadFixture(deploySavingBankFixture);
  const { owner, user, core, token, certificate } = fixture;

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

describe("SavingBankCoreUpgradeable - Withdraw at maturity", function () {
  it("should withdraw at maturity and pay interest", async function () {
    const { user, core, certificate, token, minDeposit } = await setupPlanAndVault();

    const coreAddress = await core.getAddress();
    await token.connect(user).approve(coreAddress, minDeposit);
    await core.connect(user).openDeposit(1, minDeposit);

    const depositId = await core.getMyActiveDepositId();
    const dep = await core.deposits(depositId);

    await time.increaseTo(dep.maturityAt);

    const userBalanceBefore = await token.balanceOf(user.address);
    const vaultBefore = await core.vaultBalance();

    await expect(core.connect(user).withdrawAtMaturity(depositId))
      .to.emit(core, "Withdrawn")
      .withArgs(depositId, user.address, minDeposit, anyValue, false);

    const userBalanceAfter = await token.balanceOf(user.address);
    const vaultAfter = await core.vaultBalance();

    expect(userBalanceAfter).to.be.greaterThan(userBalanceBefore);
    expect(vaultAfter).to.be.lessThan(vaultBefore);

    const activeAfter = await core.getMyActiveDepositId();
    expect(activeAfter).to.equal(0n);

    await expect(certificate.ownerDepositCertificateOf(depositId)).to.be.reverted;
  });
});
