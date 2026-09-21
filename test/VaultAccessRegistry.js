const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VaultAccessRegistry", function () {
  let Registry;
  let registry;
  let owner;
  let user1;
  let user2;

  const ROLE_VIEWER = 1;
  const ROLE_EDITOR = 2;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    Registry = await ethers.getContractFactory("VaultAccessRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // createVault
  // ---------------------------------------------------------------------------
  describe("createVault", function () {
    it("should create a vault and emit VaultCreated", async function () {
      await expect(registry.connect(owner).createVault("ipfs://QmVault1"))
        .to.emit(registry, "VaultCreated")
        .withArgs(0n, owner.address, "ipfs://QmVault1");

      const count = await registry.getVaultCount();
      expect(count).to.equal(1n);

      const [vaultOwner, ref] = await registry.getVault(0n);
      expect(vaultOwner).to.equal(owner.address);
      expect(ref).to.equal("ipfs://QmVault1");
    });

    it("should increment vaultId for each new vault", async function () {
      await registry.connect(owner).createVault("ref://a");
      await registry.connect(owner).createVault("ref://b");
      expect(await registry.getVaultCount()).to.equal(2n);
    });
  });

  // ---------------------------------------------------------------------------
  // grantAccess (with role)
  // ---------------------------------------------------------------------------
  describe("grantAccess", function () {
    beforeEach(async function () {
      await registry.connect(owner).createVault("ipfs://QmVault1");
    });

    it("should grant access with role and emit AccessGranted including role", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        registry.connect(owner).grantAccess(0n, user1.address, ROLE_VIEWER, expiry)
      )
        .to.emit(registry, "AccessGranted")
        .withArgs(0n, user1.address, expiry, ROLE_VIEWER);
    });

    it("should store role correctly and return it via getPermission", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;

      await registry.connect(owner).grantAccess(0n, user1.address, ROLE_EDITOR, expiry);

      const [active, retExpiry, retRole] = await registry.getPermission(0n, user1.address);
      expect(active).to.be.true;
      expect(retExpiry).to.equal(BigInt(expiry));
      expect(retRole).to.equal(ROLE_EDITOR);
    });

    it("should revert when non-owner tries to grant", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;

      await expect(
        registry.connect(user1).grantAccess(0n, user2.address, ROLE_VIEWER, expiry)
      ).to.be.revertedWith("Not vault owner");
    });

    it("should revert when expiresAt is in the past", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp - 10;

      await expect(
        registry.connect(owner).grantAccess(0n, user1.address, ROLE_VIEWER, expiry)
      ).to.be.revertedWith("Expiry must be in the future");
    });
  });

  // ---------------------------------------------------------------------------
  // hasAccess / checkAccess / getPermission — before and after expiry
  // ---------------------------------------------------------------------------
  describe("hasAccess / checkAccess / getPermission", function () {
    let expiry;

    beforeEach(async function () {
      await registry.connect(owner).createVault("ipfs://QmVault1");
      const latestBlock = await ethers.provider.getBlock("latest");
      expiry = latestBlock.timestamp + 3600;
      await registry.connect(owner).grantAccess(0n, user1.address, ROLE_VIEWER, expiry);
    });

    it("hasAccess returns true before expiry", async function () {
      expect(await registry.hasAccess(0n, user1.address)).to.be.true;
    });

    it("checkAccess returns true before expiry", async function () {
      expect(await registry.checkAccess(0n, user1.address)).to.be.true;
    });

    it("getPermission returns active=true before expiry", async function () {
      const [active, retExpiry, retRole] = await registry.getPermission(0n, user1.address);
      expect(active).to.be.true;
      expect(retExpiry).to.equal(BigInt(expiry));
      expect(retRole).to.equal(ROLE_VIEWER);
    });

    it("hasAccess and checkAccess return false after expiry", async function () {
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      expect(await registry.hasAccess(0n, user1.address)).to.be.false;
      expect(await registry.checkAccess(0n, user1.address)).to.be.false;
    });

    it("getPermission returns active=false after expiry (live-computed, no stale bool)", async function () {
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine");

      const [active, retExpiry, retRole] = await registry.getPermission(0n, user1.address);
      expect(active).to.be.false;
      expect(retExpiry).to.equal(BigInt(expiry)); // timestamp still stored
      expect(retRole).to.equal(ROLE_VIEWER);      // role still stored
    });

    it("returns false for a wallet that was never granted", async function () {
      expect(await registry.hasAccess(0n, user2.address)).to.be.false;
      const [active] = await registry.getPermission(0n, user2.address);
      expect(active).to.be.false;
    });
  });

  // ---------------------------------------------------------------------------
  // revokeAccess
  // ---------------------------------------------------------------------------
  describe("revokeAccess", function () {
    beforeEach(async function () {
      await registry.connect(owner).createVault("ipfs://QmVault1");
      const latestBlock = await ethers.provider.getBlock("latest");
      const expiry = latestBlock.timestamp + 3600;
      await registry.connect(owner).grantAccess(0n, user1.address, ROLE_VIEWER, expiry);
    });

    it("should revoke access and emit AccessRevoked", async function () {
      await expect(registry.connect(owner).revokeAccess(0n, user1.address))
        .to.emit(registry, "AccessRevoked")
        .withArgs(0n, user1.address);

      expect(await registry.hasAccess(0n, user1.address)).to.be.false;
      expect(await registry.checkAccess(0n, user1.address)).to.be.false;

      const [active] = await registry.getPermission(0n, user1.address);
      expect(active).to.be.false;
    });

    it("should revert when non-owner tries to revoke", async function () {
      await expect(
        registry.connect(user1).revokeAccess(0n, user1.address)
      ).to.be.revertedWith("Not vault owner");
    });
  });
});
