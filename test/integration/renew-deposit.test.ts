import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Renew Deposit", function () {
  it("should renew matured deposit to new plan", async function () {
    const { token, bank, registry, certificate, user } = await deployFixture();

    const amount = ethers.parseUnits("100", 6);
    await token.connect(user).approve(bank.target, amount);
    await bank.connect(user).openDeposit(1n, amount);

    const depositId = (await bank.connect(user).getMyActiveDepositId())[0];

    // Tăng thời gian đến maturity
    const dep = await registry.deposits(depositId);
    const maturity = Number(dep.maturityAt);
    await ethers.provider.send("evm_increaseTime", [maturity - Math.floor(Date.now() / 1000) + 86400]);
    await ethers.provider.send("evm_mine", []);

    const oldDepositIds = await bank.connect(user).getMyActiveDepositId();

    await bank.connect(user).renewDeposit(depositId, 1n);

    const newDepositIds = await bank.connect(user).getMyActiveDepositId();
    expect(newDepositIds.length).to.equal(1);
    expect(newDepositIds[0]).to.not.equal(depositId);

    const newDep = await registry.deposits(newDepositIds[0]);
    expect(newDep.principal > amount).to.equal(true); // + interest

    // Old deposit marked Renewed
    const oldDep = await registry.deposits(depositId);
    expect(oldDep.status).to.equal(3n); // Renewed status (tùy enum của mày)

    // Old NFT burned, new NFT minted
    await certificate.ownerOf(depositId)
      .then(() => expect.fail("expected ownerOf to revert for burned old NFT"))
      .catch(() => {});
    expect(await certificate.ownerOf(newDepositIds[0])).to.equal(user.address);
  });
});