import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";
import "@nomicfoundation/hardhat-chai-matchers";

describe("Open Deposit", function () {
  it("should allow user to open deposit and transfer to vault", async function () {
    const { token, bank, registry, certificate, vault, user } = await deployFixture();

    const planId = 1n;
    const amount = ethers.parseUnits("100", 6);

    // Approve
    await token.connect(user).approve(bank.target, amount);

    const userBalanceBefore = await token.balanceOf(user.address);
    const vaultBalanceBefore = await (vault as any).getVaultBalance();

    // Open deposit
    const tx = await bank.connect(user).openDeposit(planId, amount);
    await tx.wait();

    const depositIds = await bank.connect(user).getMyActiveDepositId();
    expect(depositIds.length).to.equal(1);
    const depositId = depositIds[0];

    const dep = await registry.deposits(depositId);
    expect(dep.owner).to.equal(user.address);
    expect(dep.principal).to.equal(amount);

    // Check token chuyển từ user → vault
    expect(await token.balanceOf(user.address)).to.equal(userBalanceBefore - amount);
    expect(await (vault as any).getVaultBalance()).to.equal(vaultBalanceBefore + amount);

    // Check NFT minted
    expect(await certificate.ownerOf(depositId)).to.equal(user.address);
  });

  it("should revert if amount < minDeposit", async function () {
    const { token, bank, user } = await deployFixture();

    const amount = ethers.parseUnits("5", 6); // < 10

    await token.connect(user).approve(bank.target, amount);

    await (expect as any)(
      bank.connect(user).openDeposit(1n, amount)
    ).to.be.revertedWithCustomError(bank, "InvalidAmount");
  });
});