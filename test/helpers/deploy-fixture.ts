import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  MockStablecoin,
  SavingBankUpgradeableFactory,
  SavingBankUpgradeable,
  DepositRegistry,
  DepositCertificateUpgradeable,
  Vault
} from "../../typechain";

interface Fixture {
  token: MockStablecoin;
  factory: SavingBankUpgradeableFactory;
  bank: SavingBankUpgradeable;
  registry: DepositRegistry;
  certificate: DepositCertificateUpgradeable;
  vault: Vault;
  owner: SignerWithAddress;
  user: SignerWithAddress;
}

export async function deployFixture(): Promise<Fixture> {
  const [owner, user] = await ethers.getSigners();

  // 1. Deploy MockStablecoin
  const Token = await ethers.getContractFactory("MockStablecoin");
  const token = await Token.deploy("Mock USD", "mUSD", 6);
  await token.waitForDeployment();

  // Mint cho user để test
  await token.mint(user.address, ethers.parseUnits("100000", 6));
  // Mint cho owner để admin có thể fund vault trong tests
  await token.mint(owner.address, ethers.parseUnits("1000000", 6));

  // 2. Deploy Factory
  const Factory = await ethers.getContractFactory("SavingBankUpgradeableFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  // 3. Tạo bank qua factory
  const name = "Test Cert";
  const symbol = "TST";
  const tx = await factory.createSavingBank(token.target, name, symbol);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Failed to obtain transaction receipt");

  const event = receipt.logs
    .map(log => factory.interface.parseLog(log))
    .find(e => e?.name === "SavingBankCreated");

  if (!event) throw new Error("No SavingBankCreated event");

  const bank = await ethers.getContractAt("SavingBankUpgradeable", event.args.bank);
  const registry = await ethers.getContractAt("DepositRegistry", event.args.registry);
  const certificate = await ethers.getContractAt("DepositCertificateUpgradeable", event.args.certificate);
  const vaultAddr = await bank.vault();
  const vault = await ethers.getContractAt("Vault", vaultAddr);

  // 4. Seed plan mẫu (plan ID 1)
  await bank.createPlan(30, 500, ethers.parseUnits("10", 6), 0n, 2000, true);

  // Fund vault so tests that expect interest payouts succeed
  const fundAmount = ethers.parseUnits("500000", 6);
  // Direct transfer to vault to avoid allowance/transferFrom double-call issues
  await token.connect(owner).transfer(vault.target, fundAmount);

  return { token, factory, bank, registry, certificate, vault, owner, user };
}