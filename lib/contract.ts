import deployment from "./contract.json";

// Populated by `npm run deploy:local` (writes address + abi here automatically).
export const CONTRACT_ADDRESS = deployment.address as `0x${string}`;
export const CONTRACT_ABI = deployment.abi;
