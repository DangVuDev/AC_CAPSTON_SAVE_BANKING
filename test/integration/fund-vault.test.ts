import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Fund Vault (Admin)", function () {
  it("should allow owner to fund vault", async function () {
    const { token, bank, vault, owner } = await deployFixture();

    const amount = ethers.parseUnits("5000", 6);

    const ownerBalanceBefore = await token.balanceOf(owner.address);
    const vaultBalanceBefore = await (vault as any).getVaultBalance();

    await token.connect(owner).approve(bank.target, amount);
    await bank.connect(owner).fundVault(amount);

    const ownerBalanceAfter = await token.balanceOf(owner.address);
    const vaultBalanceAfter = await (vault as any).getVaultBalance();

    expect(ownerBalanceBefore - ownerBalanceAfter).to.equal(amount);
    expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(amount);
  });

  it("should revert if non-owner calls fundVault", async function () {
    const { token, bank, user } = await deployFixture();

    const amount = ethers.parseUnits("1000", 6);
    await token.connect(user).approve(bank.target, amount);

    await (expect(bank.connect(user).fundVault(amount)) as any).to.be.revertedWithCustomError(bank, "OwnableUnauthorizedAccount");
  });

  it("should revert if amount = 0", async function () {
    const { bank, owner } = await deployFixture();

    await (expect(bank.connect(owner).fundVault(0n)) as any).to.be.revertedWithCustomError(bank, "InvalidAmount");
  });
});