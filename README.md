# EVault: Decentralized Web-Vault & Enterprise Access Manager

EVault is a wallet-gated vault for sharing secrets with time-limited access. An admin creates a vault, the secret is encrypted before it is stored, and access is granted to a team member's wallet address with an expiry. The grant lives **on-chain**. Every time someone asks to reveal a secret, the backend verifies their signed-in wallet, re-reads the permission from the blockchain, and only then decrypts. If the grant is expired, revoked, or the chain is unreachable, the secret is not revealed.

It can run entirely on your machine against a local Hardhat blockchain (so no testnet ETH is needed), and is also deployed to the Arbitrum Sepolia testnet.

Team: Tanmay, Anup, Ayaan.

## How it works

```
Browser (Next.js + RainbowKit)
   |  1. connect wallet, sign SIWE message (EIP-4361)
   |  2. admin: createVault / grantAccess / revoke  --->  Smart contract (Hardhat local chain)
   v                                                          ^
Rust backend (axum, :3001)                                    |
   |  verify SIWE signature, issue JWT session                |
   |  on every reveal: read permission live from the chain ---+
   |  only if allowed: decrypt (AES-256-GCM)
   v
PostgreSQL (stores ciphertext, never plaintext)
```

## Stack

| Layer | Technology |
| :--- | :--- |
| Smart contract | Solidity, Hardhat (`VaultAccessRegistry`: create vault, grant access with expiry, revoke, live-computed permission state) |
| Frontend | Next.js 14 (TypeScript), Tailwind, RainbowKit + wagmi, the `siwe` package |
| Backend | Rust: axum, sqlx, ethers-rs |
| Database | PostgreSQL (via Docker Compose) |
| Auth | Sign-In With Ethereum (server-issued nonce, signed message, JWT session) |
| Encryption | AES-256-GCM, unique nonce per encryption |

## Security properties (and the tests that cover them)

The backend has 23 integration and unit tests; the contract has 14 Hardhat tests.

*   **Authorize before decrypt.** A secret is decrypted only after the session is valid and the on-chain permission check passes.
*   **Reveal authorization policy:** A grant is required for every wallet, including the vault owner (the owner can reveal their own vault by granting their own address). Reveal authorization is read live from the chain on every request (no caching), fails closed with 503 if the RPC is down, and decryption only happens after authorization succeeds.
*   **Denied cases:** no permission, wrong wallet, expired permission, revoked permission (`vault_integration` tests).
*   **Fail closed.** If the blockchain RPC is unavailable, the API returns 503 instead of guessing (`test_chain_unavailable_503`).
*   **Tamper detection.** A modified ciphertext or auth tag fails decryption (`encryption` tests, `test_tampered_ciphertext_500`).
*   **SIWE hardening:** a nonce can be used once and expires; wrong domain, wrong chain ID, and tampered signatures are rejected; revoked sessions are rejected; requests without an auth header return 401 (`auth_integration` tests).
*   **Wallet addresses are normalized to lowercase** before touching the database, through a single helper.
*   **Database projection vs. on-chain truth:** The vault list and its ACTIVE/EXPIRED badge shown in the UI are read from the local database projection and can, in principle, drift from on-chain state. The actual authorization decision when revealing a secret always re-reads the blockchain live and ignores this cached state — confirmed by the on-chain-only revoke test in SETUP.md Section 7 item 4.
*   **Known limitation:** A signed-in wallet can distinguish a nonexistent vault (404) from a denied one (403); vault IDs are random UUIDs, so this is low severity.

## Quick start

Full instructions, environment variables, and troubleshooting are in **[SETUP.md](./SETUP.md)**. In short:

```bash
npm install

# 1. database
cd backend && docker compose up -d && cd ..

# 2. local blockchain (leave running)
npx hardhat node

# 3. deploy the contract (writes lib/contract.json), then put the printed
#    address in backend/.env (CONTRACT_ADDRESS)
npm run deploy:local

# 4. backend (reads the contract address once at startup)
cd backend && cargo run

# 5. frontend (new terminal, repo root)
npm run dev
```

Or run steps 1 to 5 with `npm run dev:up` (see SETUP.md Section 4).

Open http://localhost:3000. In MetaMask, add the network RPC `http://127.0.0.1:8545`, chain ID `31337`, and import two of the private keys printed by `npx hardhat node`: one as the admin, one as the user. Use two separate browser profiles so each keeps its own wallet.

## Demo flow

1.  **Admin** (`/admin`, Hardhat account #0): connect the wallet and sign in with Ethereum.
2.  Create a vault with a name and a secret. MetaMask asks you to confirm an on-chain transaction; the secret is encrypted and stored by the backend.
3.  Copy the vault ID and grant access to the second account's address with an expiry in the future.
4.  **User** (`/user`, Hardhat account #1, in the other browser profile): connect and sign in. Only vaults granted to this wallet are listed.
5.  Click **Reveal Secret**. The decrypted secret appears.
6.  As admin, revoke the access on-chain. The user clicks **Reveal Secret** again without refreshing and is denied, because the backend re-checks the chain every time rather than caching the earlier approval.
7.  A wallet that was never granted access is also denied.

## Project status

*   **Done and tested:** smart contract, Rust backend (SIWE, blockchain reads, encryption, vault and permissions API), frontend admin and user flows against the real backend, and deployment to Arbitrum Sepolia testnet.
*   **Manual verification record:** see the checklist in SETUP.md (Section 7). Items 1 to 8 recorded as complete on 2026-10-04; items 9 to 11 pending.
*   **Not implemented yet:**
    *   Activity/audit-log UI (the table is currently stubbed).
    *   Key-loss recovery and access delegation (a research gap noted in the project plan).
    *   A security audit or static-analysis pass on the contract before any real deployment.
*   **Known issues:** see SETUP.md (Sections 8 and 10).

## Contributing

Suggested workflow: use a branch and a pull request; `main` should always pass `cargo test -- --test-threads=1` and `npm run build`. No mock data or silent fallbacks: if the backend or chain is down, the UI must show an error. See the Team Guidelines in SETUP.md.