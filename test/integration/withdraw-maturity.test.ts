import { expect } from "chai";
import "@nomicfoundation/hardhat-chai-matchers";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Withdraw at Maturity", function () {
  it("should allow withdraw after maturity and pay principal + interest", async function () {
    const { token, bank, registry, certificate, vault, user } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    await token.connect(user).approve(bank.target, amount);
    await bank.connect(user).openDeposit(1n, amount);

    const depositIds = await bank.connect(user).getMyActiveDepositId();
    const depositId = depositIds[0];

    // Tăng thời gian đến maturity + 1 ngày
    const dep = await registry.deposits(depositId);
    const maturity = Number(dep.maturityAt);
    await ethers.provider.send("evm_increaseTime", [maturity - Math.floor(Date.now() / 1000) + 86400]);
    await ethers.provider.send("evm_mine", []);

    const userBalanceBefore = await token.balanceOf(user.address);
    const vaultBalanceBefore = await (vault as any).getVaultBalance();

    await bank.connect(user).withdrawAtMaturity(depositId);

    const userBalanceAfter = await token.balanceOf(user.address);
    // principal + interest (compare using bigint arithmetic)
    expect((userBalanceAfter - userBalanceBefore) > amount).to.be.true;

    // Compare bigints directly
    expect((await (vault as any).getVaultBalance()) < vaultBalanceBefore).to.be.true;

    // Deposit không còn active
    expect(await bank.connect(user).getMyActiveDepositId()).to.deep.equal([]);
    // NFT burned: ownerOf should revert for non-existent token
    let ownerReverted = false;
    try {
      await certificate.ownerOf(depositId);
    } catch (e) {
      ownerReverted = true;
    }
    expect(ownerReverted).to.be.true;
  });

  it("should revert if not matured", async function () {
    const { token, bank, user } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    await token.connect(user).approve(bank.target, amount);
    await bank.connect(user).openDeposit(1n, amount);

    const depositId = (await bank.connect(user).getMyActiveDepositId())[0];

    await (expect(bank.connect(user).withdrawAtMaturity(depositId)) as any).to.be.revertedWithCustomError(bank, "NotMatured");
  });
});