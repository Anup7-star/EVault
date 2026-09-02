# Decentralized Web-Vault & Enterprise Access Manager

Working demo covering Phases 1-4 from the plan of work. Runs entirely on your
machine using a local Hardhat blockchain — no testnet ETH needed to demo it.

## Stack (and where it differs from the slide deck, for time)
- Smart contract: Solidity — matches the plan exactly (Vault struct, grantAccess,
  expiryTimestamp, onlyOwner-style modifier, checkAccess).
- Frontend: Next.js (TypeScript) + Tailwind + wagmi/viem for wallet connect —
  same as planned, using wagmi's built-in `injected` connector instead of
  RainbowKit to avoid an extra setup step for the demo. Swappable later.
- Auth: hand-rolled EIP-4361-style SIWE (server nonce + signed message +
  `viem.verifyMessage`) — same guarantees as the `siwe` package.
- Backend & decryption: Next.js API routes (TypeScript) instead of a separate
  Rust service — same logic (verify signature → check on-chain access →
  decrypt), just co-located for a simpler local demo.
- Encrypted storage: AES-256-GCM, same as planned, backed by a JSON file
  instead of PostgreSQL for zero setup. `lib/store.ts` is the only file
  you'd touch to swap in real Postgres.

## Run it

```bash
npm install

# Terminal 1 — local blockchain
npm run chain

# Terminal 2 — deploy the contract to it (writes lib/contract.json)
npm run deploy:local

# Terminal 2 (same) — start the app
npm run dev
```

Open http://localhost:3000. In MetaMask, add a network:
- RPC URL: http://127.0.0.1:8545
- Chain ID: 31337

Import one of the private keys `npx hardhat node` prints to your terminal
into MetaMask (each has 10000 test ETH) — use one account as the admin,
a second as the requesting user.

## Demo flow (what "some result" looks like)
1. Connect wallet on `/admin` (Hardhat account #0).
2. Register a vault with a name and secret (e.g. "Prod DB password").
   This calls `registerVault()` on-chain and encrypts+stores the secret.
3. Grant access: paste the vault ID, a second wallet's address, and an
   expiry a few minutes out. This calls `grantAccess()` on-chain.
4. Switch MetaMask to the second account, go to `/user`.
5. Enter the vault ID and click "Sign In & Request Access" — MetaMask
   prompts a message signature (no password). The API verifies the
   signature, checks `checkAccess()` on-chain, and returns the decrypted
   secret only if both pass.
6. Wait past the expiry and repeat — access is denied automatically,
   enforced on-chain rather than in a backend flag.
7. Check the Audit Log on `/admin` — every grant, access request, and
   denial is logged.

## Deploying to Arbitrum Sepolia instead
Set `PRIVATE_KEY` and (optionally) `ARBITRUM_SEPOLIA_RPC` in a `.env`,
then `npm run deploy:sepolia`. Switch `lib/wagmiConfig.ts`'s default chain
and the `createPublicClient` chain in `app/api/vault/access/route.ts` to
`arbitrumSepolia`, and add Arbitrum Sepolia + test ETH to MetaMask.

## What's left for 100%
- Swap the JSON-file store for real PostgreSQL.
- Move signature verification + decryption into the planned Rust backend.
- Add key-loss recovery / access delegation (flagged as a research gap
  in the slides — worth a paragraph in the report, not required for demo).
- Security audit / static analysis pass on the contract before any real
  deployment.
