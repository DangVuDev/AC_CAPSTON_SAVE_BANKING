import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
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

describe("SavingBankCoreUpgradeable - Open deposit", function () {
  it("should open a deposit and mint NFT", async function () {
    const { user, core, certificate, token, minDeposit } = await setupPlanAndVault();

    const coreAddress = await core.getAddress();
    await token.connect(user).approve(coreAddress, minDeposit);

    const tx = await core.connect(user).openDeposit(1, minDeposit);
    const receipt = await tx.wait();

    expect(receipt!.logs.length).to.be.greaterThan(0);

    const activeId = await core.getMyActiveDepositId();
    expect(activeId).to.equal(1n);

    const dep = await core.deposits(activeId);
    expect(dep.owner).to.equal(user.address);
    expect(dep.principal).to.equal(minDeposit);

    const nftOwner = await certificate.ownerDepositCertificateOf(activeId);
    expect(nftOwner).to.equal(user.address);
  });
});
