// scripts/sepolia-smoke-test.js
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { SiweMessage } = require("siwe");

const BACKEND_URL = "http://localhost:3001";
const GRANTEE_ADDRESS = "0x8e504e0404b53Fd219C31Dd5B4E2E759288eBcEB";
const TEST_SECRET = "sepolia-deploy-test-2026-10-04";

async function main() {
  console.log("=== Starting Live Arbitrum Sepolia Smoke Test ===");
  const [signer] = await hre.ethers.getSigners();
  const adminAddress = await signer.getAddress();
  console.log("Admin Wallet:", adminAddress);
  console.log("Grantee Wallet:", GRANTEE_ADDRESS);

  const contractJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "contract.json"), "utf8")
  );
  const contractAddress = contractJson.address;
  console.log("Target Contract Address:", contractAddress);

  const contract = new hre.ethers.Contract(contractAddress, contractJson.abi, signer);

  // 1. SIWE Login
  console.log("\n--- Step 1: SIWE Authentication with Backend ---");
  const nonceRes = await fetch(`${BACKEND_URL}/auth/nonce?address=${adminAddress}`);
  if (!nonceRes.ok) throw new Error(`Failed to get nonce: ${nonceRes.statusText}`);
  const { nonce } = await nonceRes.json();
  console.log("Obtained Nonce:", nonce);

  const siweMessage = new SiweMessage({
    domain: "localhost:3000",
    address: adminAddress,
    statement: "Sign in to EVault",
    uri: "http://localhost:3000",
    version: "1",
    chainId: 421614,
    nonce: nonce,
    issuedAt: new Date().toISOString(),
  });

  const messageText = siweMessage.prepareMessage();
  const signature = await signer.signMessage(messageText);

  const verifyRes = await fetch(`${BACKEND_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messageText, signature }),
  });
  if (!verifyRes.ok) {
    const errText = await verifyRes.text();
    throw new Error(`SIWE verify failed: ${errText}`);
  }
  const verifyData = await verifyRes.json();
  const token = verifyData.token;
  console.log("SIWE Authenticated. JWT token acquired.");

  // 2. Check or Create Vault on Arbitrum Sepolia
  console.log("\n--- Step 2: On-chain createVault Transaction ---");
  const count = await contract.getVaultCount();
  let blockchainVaultId = 0;
  let createTxHash = "0xfa24d13659e519d57ac1a9b4c6629139eeb229f18ecbcdf66379d8baf20dc596";

  if (count === 0n) {
    const createTx = await contract.createVault("Sepolia Test Vault");
    createTxHash = createTx.hash;
    console.log("CreateVault Tx submitted. Hash:", createTx.hash);
    console.log(`Arbiscan Link: https://sepolia.arbiscan.io/tx/${createTx.hash}`);
    const createReceipt = await createTx.wait();
    console.log("CreateVault Tx confirmed in block:", createReceipt.blockNumber);
    blockchainVaultId = 0;
  } else {
    console.log("Vault 0 already minted on-chain in previous tx:", createTxHash);
    console.log(`Arbiscan Link: https://sepolia.arbiscan.io/tx/${createTxHash}`);
    blockchainVaultId = 0;
  }
  console.log("On-chain Blockchain Vault ID:", blockchainVaultId);

  // 3. Register Vault with Backend
  console.log("\n--- Step 3: Registering Vault in Backend ---");
  const vaultPayload = {
    blockchainVaultId: blockchainVaultId,
    name: "Sepolia Test Vault",
    description: "Smoke test deployment on Arbitrum Sepolia",
    storageReference: "arbiscan-sepolia",
    secret: TEST_SECRET,
  };

  const createVaultRes = await fetch(`${BACKEND_URL}/vaults`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(vaultPayload),
  });

  let vaultId;
  if (createVaultRes.status === 201) {
    const createVaultData = await createVaultRes.json();
    console.log("Backend Create Vault Status: 201 Created");
    console.log("Backend Create Vault Response Body:", JSON.stringify(createVaultData, null, 2));
    vaultId = createVaultData.id;
  } else {
    console.log(`Backend Create Vault returned status ${createVaultRes.status}, fetching vaults list...`);
    const listRes = await fetch(`${BACKEND_URL}/vaults`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listData = await listRes.json();
    const existingVault = listData.find((v) => v.blockchainVaultId === blockchainVaultId);
    if (!existingVault) throw new Error("Could not find vault with blockchainVaultId " + blockchainVaultId);
    vaultId = existingVault.id;
    console.log("Found existing backend Vault ID:", vaultId);
  }

  // 4. Grant Access on Arbitrum Sepolia (expiry: 15 minutes out, role: 2)
  console.log("\n--- Step 4: On-chain grantAccess Transaction ---");
  const expiryDate = new Date(Date.now() + 15 * 60 * 1000);
  const expiryUnix = Math.floor(expiryDate.getTime() / 1000);
  const expiryIso = expiryDate.toISOString();
  let grantTxHash = "0xa2180613b22d520eae562e7e9e2400db1ee39662663bbfa027626938ee3bdb91";

  // Check if role is already granted on-chain
  const [isActive, onChainExpiry, onChainRole] = await contract.getPermission(blockchainVaultId, GRANTEE_ADDRESS);
  if (!isActive) {
    const grantTx = await contract.grantAccess(blockchainVaultId, GRANTEE_ADDRESS, 2, expiryUnix);
    grantTxHash = grantTx.hash;
    console.log("GrantAccess Tx submitted. Hash:", grantTx.hash);
    console.log(`Arbiscan Link: https://sepolia.arbiscan.io/tx/${grantTx.hash}`);
    const grantReceipt = await grantTx.wait();
    console.log("GrantAccess Tx confirmed in block:", grantReceipt.blockNumber);
  } else {
    console.log("GrantAccess already active on-chain!");
    console.log(`On-chain Role: ${onChainRole}, Expiry: ${new Date(Number(onChainExpiry) * 1000).toISOString()}`);
    console.log("GrantAccess Tx Hash:", grantTxHash);
    console.log(`Arbiscan Link: https://sepolia.arbiscan.io/tx/${grantTxHash}`);
  }

  // 5. Register Grant in Backend
  console.log("\n--- Step 5: Registering Permission in Backend ---");
  const grantPayload = {
    walletAddress: GRANTEE_ADDRESS,
    role: 2,
    expiresAt: expiryIso,
  };

  const grantRes = await fetch(`${BACKEND_URL}/vaults/${vaultId}/permissions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(grantPayload),
  });

  console.log("Backend Grant Permission Status:", grantRes.status);
  if (grantRes.status === 204) {
    console.log("Backend Grant Permission: 204 No Content (Success)");
  } else {
    const grantData = await grantRes.text();
    console.log("Backend Grant Permission Response Body:", grantData);
  }

  // 6. Query Permissions from Backend
  console.log("\n--- Step 6: Verifying Permissions list from Backend ---");
  const getPermsRes = await fetch(`${BACKEND_URL}/vaults/${vaultId}/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const permsData = await getPermsRes.json();
  console.log("Backend Permissions list:", JSON.stringify(permsData, null, 2));

  console.log("\n=== SMOKE TEST TRANSACTIONS COMPLETE ===");
  console.log(JSON.stringify({
    vaultId,
    blockchainVaultId,
    createTxHash: createTxHash,
    createTxUrl: `https://sepolia.arbiscan.io/tx/${createTxHash}`,
    grantTxHash: grantTxHash,
    grantTxUrl: `https://sepolia.arbiscan.io/tx/${grantTxHash}`,
    grantee: GRANTEE_ADDRESS,
    expiresAt: expiryIso,
  }, null, 2));
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exitCode = 1;
});
