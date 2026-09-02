# Product Requirements Document
## Decentralized Web-Vault & Enterprise Access Manager

**Team:** Anup S [25BCE5399], Ayaan [25BCE5578], Tanmay [25BCE5539]  
**Type:** Blockchain Mini Project  
**Status:** Working demo (local network) delivered — testnet deployment pending  

---

## 1. Problem Statement

Enterprises protect sensitive data (API keys, server credentials, internal records) with username/password systems tied to a centralized identity server. This creates single points of failure: a compromised server or database leak exposes every credential at once, password reuse and phishing remain the dominant attack vector, and access expiry is enforced in a backend database — which means it can be silently overridden by an admin mistake, a bug, or a compromised server.

Existing blockchain-based access tools don't solve this for enterprise use: they authenticate a wallet, but don't tie that identity to a specific data vault with fine-grained, on-chain, tamper-proof permissions.

## 2. Product Overview

A **Decentralized Web-Vault & Enterprise Access Manager** — a blockchain-based replacement for password-protected access to sensitive company data. Users authenticate with a crypto wallet instead of a username/password. Administrators register "vaults" on-chain and grant specific wallet addresses time-bound access. When a user requests access, the backend verifies wallet ownership via a signed message, checks authorization directly against the blockchain, and — only if both checks pass — decrypts and serves the protected content.

## 3. Goals

- Replace password-based access control with cryptographic wallet ownership (no passwords, no central credential store to breach).
- Enforce access expiry immutably on-chain, not in a backend flag that can be silently overridden.
- Pair on-chain authorization with encrypted data release, so a signature check directly gates decryption — not two separate, looser systems.
- Give administrators a full audit trail of every grant, revoke, and access attempt.

## 4. Non-Goals (Out of Scope)

- Recovering access after a lost private key (flagged as an open research gap — no password-reset equivalent exists in this design).
- General-purpose file storage; this manages access to discrete "secrets" (credentials, keys, short records), not large files.
- Multi-chain support beyond the target testnet.
- Formal smart-contract security audit (recommended before any real deployment, not part of this project's scope).

## 5. Users & Use Cases

| Persona | Needs |
|---|---|
| **Admin** | Register a vault, grant/revoke wallet access with an expiry, see who has access and an audit trail of activity. |
| **User (employee/service)** | Prove identity without a password, request access to a vault they've been granted, view the protected content while access is valid, be denied automatically once it expires. |

**Core use case:** An admin grants a contractor's wallet 7-day access to a staging API key. The contractor connects their wallet, signs a message to prove ownership, and views the key. After 7 days, the same wallet is denied automatically — no admin action required to revoke it.

## 6. Functional Requirements

### 6.1 Admin
- **FR1:** Register a new vault (name + protected content) — writes a vault record on-chain and stores the encrypted content off-chain.
- **FR2:** Grant a wallet address time-bound access to a vault, with an explicit expiry timestamp enforced on-chain.
- **FR3:** Revoke a wallet's access to a vault at any time.
- **FR4:** View a real-time audit log of vault registrations, grants, revocations, and access attempts (granted and denied).

### 6.2 User
- **FR5:** Connect a wallet (e.g. MetaMask) instead of logging in with credentials.
- **FR6:** Sign a message to prove wallet ownership, without exposing a private key or requiring a password.
- **FR7:** Request access to a specific vault by ID.
- **FR8:** View decrypted vault content only while access is valid; receive a clear denial when access hasn't been granted or has expired.

### 6.3 System
- **FR9:** All access grants, revocations, and expiry checks are evaluated on-chain — not solely in a backend database.
- **FR10:** Signature verification is required before any decryption occurs; there is no separate "session" that persists independently of the signature check.
- **FR11:** Vault content is encrypted at rest and only decrypted server-side after both signature and on-chain access checks pass.

## 7. Non-Functional Requirements

- **Security:** AES-256-GCM for data at rest; access control enforced by smart contract, not application logic alone; nonce-based replay protection on every sign-in.
- **Auditability:** Every state-changing action (register, grant, revoke) and every access decision (granted/denied) is logged and retrievable.
- **Usability:** No password to remember or reset; wallet connection and signing should require no more than two prompts per access request.
- **Portability:** Designed to run against a local test network for development/demo and against a public testnet (Arbitrum Sepolia) for deployment, without changing the data model.

## 8. System Architecture

```
Admin/User → Wallet (MetaMask) → Frontend (Next.js)
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                              ▼
                 Backend API                    Smart Contract
        (verify signature, decrypt)      (Vault registry, access
                         │                control, expiry — source
                         ▼                     of truth)
              Encrypted Storage
              (secrets at rest)
```

**Flow:** Admin registers vault (on-chain) → grants wallet access with expiry (on-chain) → user connects wallet → signs a one-time message → backend verifies signature → backend checks `checkAccess()` on-chain → if valid, backend decrypts and returns the vault content.

## 9. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Smart Contracts | Solidity | Vault registry, access grants, expiry enforcement |
| Blockchain Network | Arbitrum Sepolia (testnet) / local Hardhat network (dev) | Deployment target / fast iterative demo |
| Frontend | Next.js, TypeScript, Tailwind CSS, wagmi + viem | Web UI, wallet connection, contract calls |
| Authentication | EIP-4361-style Sign-In with Ethereum (SIWE) | Passwordless auth via wallet signature |
| Backend & Decryption | API layer (signature verification, contract reads, decryption) | Gates and serves protected content |
| Encrypted Storage | AES-256-GCM + persistent store | Secrets at rest |

## 10. Success Metrics

- End-to-end flow (register → grant → sign-in → access → auto-expiry) completes without manual database intervention.
- 100% of access grants and revocations are independently verifiable on-chain (not just in application logs).
- Zero passwords or shared secrets used anywhere in the authentication path.
- Every access decision (granted or denied) is captured in the audit log.

## 11. Known Limitations

- **Lost private key = permanent lockout** — no password-reset equivalent; a lost wallet key permanently cuts off access.
- **Wallet usability barrier** — non-technical enterprise users may struggle to set up and manage a crypto wallet.
- **Smart contract risk** — bugs or unaudited code could be exploited (e.g. access-control flaws); a security audit is recommended before any production use.
- **Compliance conflict** — blockchain immutability can clash with regulations like GDPR's "right to be forgotten."

## 12. Research Gap Addressed

Existing blockchain identity/access systems (DIDs, SSO wallet logins, NFT/DAO token-gating) authenticate a *user* but don't tie that identity to a specific enterprise data vault with fine-grained, on-chain-enforced expiry. Most systems enforce "time-bound access" off-chain, where it can be silently overridden, and pair access control with encrypted storage loosely rather than in a single signature-gated handshake. This project wires wallet-based authorization directly to encrypted data release, with expiry enforced immutably on-chain — a gap noted in prior work such as *Blockchain-based Access Control for Enterprise Blockchain Applications* (2020), which similarly argues for decentralized enterprise access control over centralized identity servers.

## 13. Milestones / Plan of Work

| Phase | Deliverable | Status |
|---|---|---|
| 1 | Smart contract: vault data structure, access-control logic | Done |
| 2 | Wallet authentication (SIWE flow) | Done |
| 3 | Backend handshake: verify signature → check on-chain access → decrypt | Done |
| 4 | Admin & user dashboards (frontend) | Done (local demo) |
| 5 | Testnet deployment & validation (Arbitrum Sepolia) | Pending |
| 6 | Security review / static analysis | Pending |

## 14. Open Questions

- Should access delegation (an admin temporarily transferring grant authority) be added, given it's an identified gap in existing research?
- What is the recovery path, if any, for a lost wallet key beyond "permanent lockout" — is a social-recovery or multi-sig admin override acceptable for enterprise use?
