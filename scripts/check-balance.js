// scripts/check-balance.js
const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    throw new Error("No signer configured for the active network.");
  }
  const address = await signer.getAddress();
  const provider = hre.ethers.provider;
  const balance = await provider.getBalance(address);
  const ethBalance = hre.ethers.formatEther(balance);
  const network = await provider.getNetwork();

  console.log("Network Name:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Wallet Address:", address);
  console.log("Balance:", ethBalance, "ETH");
}

main().catch((err) => {
  console.error("Balance check error:", err);
  process.exitCode = 1;
});
