const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const Registry = await hre.ethers.getContractFactory("VaultAccessRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("VaultAccessRegistry deployed to:", address);

  // Write address + ABI for the frontend to consume
  const artifact = await hre.artifacts.readArtifact("VaultAccessRegistry");
  const out = {
    address,
    abi: artifact.abi,
  };
  const outPath = path.join(__dirname, "..", "lib", "contract.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote ABI + address to lib/contract.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
