import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";
import { Vault, MockStablecoin } from "../../typechain-types";

describe("Vault", function () {
  let vault: Vault;
  let token: MockStablecoin;
  let owner: any, savingBank: any;

  beforeEach(async function () {
    const f = await deployFixture();
    vault = f.vault;
    token = f.token;
    owner = f.owner;
    savingBank = f.bank.address;
  });

  it("should allow SavingBank to fund vault", async function () {
    const amount = ethers.utils.parseUnits("1000", 6);
    await token.connect(owner).approve(vault.address, amount);
    await vault.fund(amount);
    expect(await vault.vaultBalance()).to.equal(amount);
  });

  it("should allow SavingBank to withdrawTo user", async function () {
    const amount = ethers.utils.parseUnits("500", 6);
    await token.connect(owner).approve(vault.address, amount);
    await vault.fund(amount);

    const userBalanceBefore = await token.balanceOf(owner.address);
    await vault.withdrawTo(amount, owner.address);
    const userBalanceAfter = await token.balanceOf(owner.address);

    expect(userBalanceAfter.sub(userBalanceBefore)).to.equal(amount);
    expect(await vault.vaultBalance()).to.equal(0);
  });

  it("should revert if non-SavingBank calls fund", async function () {
    await expect(vault.connect(owner).fund(100)).to.be.revertedWithCustomError(vault, "OnlySavingBankOrOwner");
  });
});