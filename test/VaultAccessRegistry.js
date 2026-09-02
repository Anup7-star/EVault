const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaultAccessRegistry", function () {
  let Registry;
  let registry;
  let owner;
  let user1;
  let user2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    Registry = await ethers.getContractFactory("VaultAccessRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  describe("Vault Registration", function () {
    it("Should register a vault and emit VaultRegistered", async function () {
      await expect(registry.connect(owner).registerVault("Vault 1"))
        .to.emit(registry, "VaultRegistered")
        .withArgs(0n, owner.address, "Vault 1");

      const count = await registry.getVaultCount();
      expect(count).to.equal(1n);

      const [vaultOwner, vaultName] = await registry.getVault(0n);
      expect(vaultOwner).to.equal(owner.address);
      expect(vaultName).to.equal("Vault 1");
    });
  });

  describe("Access Grants", function () {
    beforeEach(async function () {
      await registry.connect(owner).registerVault("Vault 1");
    });

    it("Should grant access and verify checkAccess works before and after expiry", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600; // 1 hour in future

      await expect(registry.connect(owner).grantAccess(0n, user1.address, expiry))
        .to.emit(registry, "AccessGranted")
        .withArgs(0n, user1.address, expiry);

      expect(await registry.checkAccess(0n, user1.address)).to.be.true;

      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      expect(await registry.checkAccess(0n, user1.address)).to.be.false;
    });

    it("Should fail if non-owner tries to grant access", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        registry.connect(user1).grantAccess(0n, user2.address, expiry)
      ).to.be.revertedWith("Not vault owner");
    });

    it("Should fail if expiry is in the past", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp - 10;

      await expect(
        registry.connect(owner).grantAccess(0n, user1.address, expiry)
      ).to.be.revertedWith("Expiry must be in the future");
    });
  });

  describe("Access Revocation", function () {
    beforeEach(async function () {
      await registry.connect(owner).registerVault("Vault 1");
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;
      await registry.connect(owner).grantAccess(0n, user1.address, expiry);
    });

    it("Should revoke access", async function () {
      await expect(registry.connect(owner).revokeAccess(0n, user1.address))
        .to.emit(registry, "AccessRevoked")
        .withArgs(0n, user1.address);

      expect(await registry.checkAccess(0n, user1.address)).to.be.false;
    });

    it("Should fail if non-owner tries to revoke access", async function () {
      await expect(
        registry.connect(user1).revokeAccess(0n, user1.address)
      ).to.be.revertedWith("Not vault owner");
    });
  });
});
