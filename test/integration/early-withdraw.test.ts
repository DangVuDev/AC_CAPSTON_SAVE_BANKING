import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Early Withdraw", function () {
  it("should allow early withdraw with penalty", async function () {
    const { token, bank, registry, certificate, vault, user } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    await token.connect(user).approve(bank.target, amount);
    await bank.connect(user).openDeposit(1n, amount);

    const depositId = (await bank.connect(user).getMyActiveDepositId())[0];

    const userBalanceBefore = await token.balanceOf(user.address);
    const feeReceiver = await bank.feeReceiver();
    const feeBefore = await token.balanceOf(feeReceiver);

    await bank.connect(user).earlyWithdraw(depositId);

    const userBalanceAfter = await token.balanceOf(user.address);
    const feeAfter = await token.balanceOf(feeReceiver);

    const userReceived = userBalanceAfter - userBalanceBefore;
    const penalty = feeAfter - feeBefore;

    expect(userReceived + penalty).to.equal(amount);
    expect(userReceived < amount).to.equal(true); // có trừ penalty

    // Deposit không còn active
    expect(await bank.connect(user).getMyActiveDepositId()).to.deep.equal([]);
    try {
      await certificate.ownerOf(depositId);
      throw new Error("ownerOf did not revert");
    } catch (err: any) {
      expect(err).to.be.instanceOf(Error);
    }
  });
});