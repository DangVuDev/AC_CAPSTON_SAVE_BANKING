import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFixture } from "../helpers/deploy-fixture";

describe("Open Deposit Integration", function () {
  it("should allow user to open deposit and money goes to Vault", async function () {
    const { token, vault, bank, registry, certificate, user } = await deployFixture();

    // Mint token cho user
    await token.mint(user.address, ethers.utils.parseUnits("10000", 6));

    // Tạo plan mẫu
    await bank.connect(user.signer).createPlan(30, 500, ethers.utils.parseUnits("100", 6), 0, 1000, true);

    const planId = 1;
    const amount = ethers.utils.parseUnits("500", 6);

    // Approve cho SavingBank
    await token.connect(user).approve(bank.address, amount);

    // Gọi openDeposit
    const tx = await bank.connect(user).openDeposit(planId, amount);
    const receipt = await tx.wait();

    // Check event DepositOpened
    const event = receipt.events?.find(e => e.event === "DepositOpened");
    expect(event).to.exist;
    const depositId = event?.args?.depositId;

    // Check Vault nhận tiền
    expect(await vault.vaultBalance()).to.equal(amount);

    // Check Registry có deposit
    const dep = await registry.deposits(depositId);
    expect(dep.owner).to.equal(user.address);
    expect(dep.principal).to.equal(amount);

    // Check NFT minted
    expect(await certificate.ownerOf(depositId)).to.equal(user.address);
  });
});