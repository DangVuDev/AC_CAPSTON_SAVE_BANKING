import hre from "hardhat";

const { ethers } = hre;

export async function deploySavingBankFixture() {
  const [owner, user, other] = await ethers.getSigners();

  const MockStablecoin = await ethers.getContractFactory("MockStablecoin");
  const token = await MockStablecoin.deploy("Mock USD", "mUSD", 18);

  const initialSupply = ethers.parseUnits("1000000", 18);
  await token.mint(owner.address, initialSupply);
  await token.mint(user.address, initialSupply);

  const Factory = await ethers.getContractFactory("SavingBankUpgradeableFactory");
  const factory = await Factory.deploy();

  await factory.createSavingBank(token, "Saving NFT", "SVNFT");

  const [coreAddr, certificateAddr] = await factory.getBankDeployment(0);

  const Core = await ethers.getContractFactory("SavingBankCoreUpgradeable");
  const Certificate = await ethers.getContractFactory("DepositCertificateUpgradeable");

  const core = Core.attach(coreAddr);
  const certificate = Certificate.attach(certificateAddr);

  return { owner, user, other, token, factory, core, certificate };
}
