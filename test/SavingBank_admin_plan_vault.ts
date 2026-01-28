import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { deploySavingBankFixture } from "./helpers/deploySavingBankFixture";

describe("SavingBankCoreUpgradeable - Admin plan & vault", function () {
  it("should allow owner to create a valid plan", async function () {
    const { owner, core, token } = await loadFixture(deploySavingBankFixture);

    const tenorDays = 7;
    const aprBps = 800;
    const minDeposit = (await token.decimals()) === 18
      ? (await token.decimals(), 18) && BigInt(10) ** BigInt(20) // dummy, replaced below
      : BigInt(0); // placeholder, will be reassigned

    const realMin = BigInt(10) ** BigInt(20); // 100 * 1e18

    const maxDeposit = 0n; // unlimited
    const penaltyBps = 500;

    await expect(
      core
        .connect(owner)
        .createPlan(tenorDays, aprBps, realMin, maxDeposit, penaltyBps, true)
    )
      .to.emit(core, "PlanCreated")
      .withArgs(1, tenorDays, aprBps, realMin, maxDeposit, penaltyBps, true);

    const plan = await core.plans(1);
    expect(plan.id).to.equal(1n);
    expect(plan.tenorDays).to.equal(tenorDays);
    expect(plan.aprBps).to.equal(aprBps);
    expect(plan.minDeposit).to.equal(realMin);
    expect(plan.maxDeposit).to.equal(maxDeposit);
  });

  it("should fund and withdraw from vault correctly", async function () {
    const { owner, core, token } = await loadFixture(deploySavingBankFixture);

    const amount = BigInt(1000) * BigInt(10) ** BigInt(18);
    const coreAddress = await core.getAddress();

    await token.connect(owner).approve(coreAddress, amount);

    await expect(core.connect(owner).fundVault(amount))
      .to.emit(core, "VaultFunded")
      .withArgs(owner.address, amount);

    expect(await core.vaultBalance()).to.equal(amount);

    await expect(core.connect(owner).withdrawVault(amount))
      .to.emit(core, "VaultWithdrawn")
      .withArgs(owner.address, amount);

    expect(await core.vaultBalance()).to.equal(0n);
  });
});
