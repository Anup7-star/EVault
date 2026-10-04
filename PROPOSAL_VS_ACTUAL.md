# Proposal vs. Actual Implementation

A concise comparison between the original EVault pitch deck proposal and the system as built and deployed.

---

## 1. Technology Stack

| Proposed Technology | Status | Implementation Details / Deviations |
| :--- | :--- | :--- |
| **Solidity (Smart Contracts)** | Built as proposed | Implemented in `contracts/AccessControl.sol` (v0.8.28) managing vault permissions & revocations on-chain. |
| **Arbitrum Sepolia (L2)** | Built as proposed | Deployed live to Arbitrum Sepolia testnet (Chain ID 421614) for fast, low-cost permission checks. |
| **Next.js & TypeScript** | Built as proposed | Built with Next.js 14 App Router and TypeScript (`app/page.tsx`, `app/admin/page.tsx`, `app/user/page.tsx`). |
| **Tailwind CSS** | Built as proposed | Custom warm dark-mode design system configured in `tailwind.config.js` and `app/globals.css`. |
| **Wagmi & Viem** | Built as proposed | Integrated in `components/Providers.tsx`, `components/ConnectWallet.tsx`, and page components for wallet/chain state. |
| **RainbowKit** | Built as proposed | RainbowKit v2 modal in `components/Providers.tsx` for wallet connection and account switching. |
| **SIWE (EIP-4361)** | Built as proposed | SIWE implemented frontend (`siwe` npm package) and backend (`siwe` crate) for cryptographic challenge-response auth. |
| **Rust (Backend)** | Built as proposed | Axum 0.7 REST API with Tokio async runtime and SQLx in `./backend`. |
| **Ethers.js / Ethers-rs** | Built as proposed | `ethers` v6 in frontend client scripts; `ethers-rs` (v2.0) in backend for live on-chain contract querying. |
| **AES-256-GCM** | Built as proposed | `aes-gcm` (v0.10) crate in backend with random 96-bit nonces; client-side PBKDF2/AES-GCM in `lib/vaultCrypto.ts`. |
| **PostgreSQL** | Built as proposed | PostgreSQL with SQLx migrations for vaults, permissions projections, sessions, nonces, and audit logs. |

---

## 2. Core Security Properties

- **Wallet-Based Auth (Replacing Passwords):** Implemented via SIWE (EIP-4361) with single-use expiring nonces, replay protection, and domain/chain binding.  
  *Verified in:* `backend/tests/auth_integration.rs` (`test_auth_full_flow_success`, `test_replay_attack_rejected`, `test_different_wallet_signature_rejected`).
- **On-Chain Permission with Expiry:** Permissions and time-bound expiries are recorded directly on-chain and live-checked on every request; fail-closed on revocation.  
  *Verified in:* `backend/tests/blockchain_integration.rs` (`test_check_permission_on_chain`, `test_is_revoked_on_chain`).
- **Encryption at Rest:** Secrets are encrypted using AES-256-GCM with unique random 96-bit nonces prior to persistence. Plaintext is never stored in DB.  
  *Verified in:* `backend/tests/encryption_tests.rs` (`test_encrypt_decrypt_roundtrip`, `test_wrong_key_fails_decryption`).
- **Backend Gated Decryption:** `GET /vaults/:vaultId/secret` performs live smart contract permission checks and returns 403 on unauthorized or revoked wallets.  
  *Verified in:* `backend/tests/vault_integration.rs` (`test_get_vault_secret_authorized_grantee`, `test_get_vault_secret_unauthorized_wallet`).

---

## 3. Scope Decisions & Open Questions

- **Session Mechanism (Resolved):** Standardized on stateless HMAC/JWT bearer tokens (`sessions` table tracks revocations) with 24-hour expiration.
- **Key Management (Resolved for MVP, Production Open):** Master AES-256-GCM server key loaded via `ENCRYPTION_KEY_HEX` environment variable; KMS/HSM integration remains open for production scale.
- **Database Schema (Resolved):** Implemented relational schema across 5 core tables (`vaults`, `permissions`, `sessions`, `auth_nonces`, `audit_logs`) with normalized lowercase addresses.
- **Delegation & Recovery Model (Open):** Single-owner wallet architecture implemented; multi-sig delegation, social recovery, and key rotation remain open.

---

## 4. Live Deployment Status

- **Network:** Arbitrum Sepolia Testnet (Chain ID `421614`)
- **Contract Address:** [`0xA4B7295B1c1e69d91EAC319C7B86ff5De45e93E9`](https://sepolia.arbiscan.io/address/0xA4B7295B1c1e69d91EAC319C7B86ff5De45e93E9)
- **Explorer Link:** [Arbiscan Contract Explorer](https://sepolia.arbiscan.io/address/0xA4B7295B1c1e69d91EAC319C7B86ff5De45e93E9)

---

## 5. Scope Not Implemented from Original Vision

- Multi-owner / delegated administration, automated cryptographic key rotation (KMS/HSM), and emergency wallet recovery mechanisms are not implemented in this version (vaults are strictly single-owner controlled).
