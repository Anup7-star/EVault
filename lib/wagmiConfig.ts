import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "@wagmi/core";

// Local Hardhat network — used for the demo (no testnet ETH needed)
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

// Arbitrum Sepolia — the target testnet per the project's tech stack
export const arbitrumSepolia = defineChain({
  id: 421614,
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rollup.arbitrum.io/rpc"] } },
  blockExplorers: { default: { name: "Arbiscan", url: "https://sepolia.arbiscan.io" } },
});

export const wagmiConfig = createConfig({
  chains: [hardhatLocal, arbitrumSepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [hardhatLocal.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
  ssr: true,
});
