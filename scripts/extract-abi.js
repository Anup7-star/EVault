/**
 * extract-abi.js
 * Reads the compiled artifact for VaultAccessRegistry and overwrites
 * lib/contract.json with the fresh ABI, preserving the existing address.
 *
 * Usage: node scripts/extract-abi.js
 */
const fs = require("fs");
const path = require("path");

const artifactPath = path.resolve(
  __dirname,
  "../artifacts/contracts/VaultAccessRegistry.sol/VaultAccessRegistry.json"
);
const contractJsonPath = path.resolve(__dirname, "../lib/contract.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run `npx hardhat compile` first.");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

// Preserve the existing address if contract.json already exists
let existingAddress = "0x0000000000000000000000000000000000000000";
if (fs.existsSync(contractJsonPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(contractJsonPath, "utf8"));
    if (existing.address) existingAddress = existing.address;
  } catch (_) {}
}

const output = {
  address: existingAddress,
  abi: artifact.abi,
};

fs.writeFileSync(contractJsonPath, JSON.stringify(output, null, 2) + "\n");
console.log(`lib/contract.json updated (${artifact.abi.length} ABI entries).`);
