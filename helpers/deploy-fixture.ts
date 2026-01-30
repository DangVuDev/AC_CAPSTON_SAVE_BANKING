// test/helpers/deploy-fixture.ts
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MockStablecoin, Vault, DepositRegistry, DepositCertificateUpgradeable, SavingBankUpgradeable } from "../../typechain-types";

interface Fixture {
  token: MockStablecoin;
  vault: Vault;
  registry: DepositRegistry;
  certificate: DepositCertificateUpgradeable;
  bank: SavingBankUpgradeable;
  owner: SignerWithAddress;
  user: SignerWithAddress;
}

export async function deployFixture(): Promise<Fixture> {
  const [owner, user] = await ethers.getSigners();

  // Deploy MockStablecoin
  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy("Mock USD", "mUSD", 6);
  await token.deployed();

  // Mint token cho user
  await token.mint(user.address, ethers.utils.parseUnits("10000", 6));

  // Deploy Vault
  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(token.address, ethers.constants.AddressZero, owner.address); // savingBankCore sẽ update sau
  await vault.deployed();

  // Deploy DepositRegistry
  const Registry = await ethers.getContractFactory("DepositRegistry");
  const registry = await Registry.deploy();
  await registry.deployed();

  // Deploy DepositCertificate
  const Certificate = await ethers.getContractFactory("DepositCertificateUpgradeable");
  const certificate = await Certificate.deploy();
  await certificate.initialize("SavingBank Certificate", "SBC", owner.address);
  await certificate.deployed();

  // Deploy SavingBank
  const Bank = await ethers.getContractFactory("SavingBankUpgradeable");
  const bank = await Bank.deploy();
  await bank.initialize(
    token.address,
    registry.address,
    certificate.address,
    vault.address,
    owner.address
  );
  await bank.deployed();

  // Update Vault với savingBankCore
  await vault.updateSavingBankCore(bank.address); // Nếu Vault có hàm này, hoặc set trong constructor

  // Set quyền cho SavingBank
  await registry.setBankExecutable(bank.address, true);
  await certificate.setBankExecutable(bank.address);

  return { token, vault, registry, certificate, bank, owner, user };
}