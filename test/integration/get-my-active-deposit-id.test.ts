import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Get My Active Deposit ID", function () {
  it("should return correct active deposit IDs for user", async function () {
    const { token, bank, user } = await deployFixture();

    // Ban đầu không có deposit
    let activeIds = await bank.connect(user).getMyActiveDepositId();
    expect(activeIds.length).to.equal(0);

    // Open 2 deposit
    const amount = ethers.parseUnits("100", 6);
    await token.connect(user).approve(bank.target, amount * 2n);
    await bank.connect(user).openDeposit(1n, amount);
    await bank.connect(user).openDeposit(1n, amount);

    activeIds = await bank.connect(user).getMyActiveDepositId();
    expect(activeIds.length).to.equal(2);

    // Withdraw 1 cái (advance time to maturity first)
    // Increase time sufficiently (e.g. 40 days) so deposit matures
    await ethers.provider.send("evm_increaseTime", [40 * 86400]);
    await ethers.provider.send("evm_mine", []);
    await bank.connect(user).withdrawAtMaturity(activeIds[0]);

    activeIds = await bank.connect(user).getMyActiveDepositId();
    expect(activeIds.length).to.equal(1);
  });

  it("should return empty array for user with no deposits", async function () {
    const { bank, user } = await deployFixture();

    const activeIds = await bank.connect(user).getMyActiveDepositId();
    expect(activeIds).to.deep.equal([]);
  });
});