# EVault Local Development Setup Guide

This runbook provides step-by-step instructions to get a fresh clone of EVault (Contract + Rust Backend + Next.js Frontend) running locally. Follow these steps in order to avoid common setup issues.

## 1. Prerequisites

Before starting, ensure you have the following installed. Run the provided commands to verify:

*   **Node.js & npm**: (Tested against standard current versions, e.g. Node v18+ or v20+)
    ```bash
    node -v
    npm -v
    ```
*   **Rust**: Install via [rustup](https://rustup.rs/).
    > [!WARNING]
    > **Crucial:** After installing Rust, you MUST open a completely **brand-new terminal window** (do not reuse an existing one). Otherwise, the `cargo` command won't be found on your PATH.
    ```bash
    cargo --version
    ```
*   **Docker Desktop**: Required to run the local PostgreSQL database.
    > [!TIP]
    > **Windows Users:** If `docker info` fails with a pipe/connection error, confirm Docker Desktop is actually launched (not just installed). Wait for the tray icon to show "Engine running". If `wsl -l -v` doesn't show a `docker-desktop-data` entry, run `wsl --update` in an admin terminal, then relaunch Docker Desktop.
*   **MetaMask**: Browser extension installed in your web browser.

## 2. Clone & Install

1.  **Clone the repository:**
    ```bash
    git clone <repository_url> evault
    cd evault
    ```
2.  **Install Frontend & Hardhat Dependencies (Root):**
    ```bash
    npm install
    ```
    *(Note: if you encounter peer dependency errors from `hardhat-toolbox`, append `--legacy-peer-deps`)*
3.  **Verify Backend Build:**
    ```bash
    cd backend
    cargo build
    cd ..
    ```

## 3. Environment Files

You need to create two environment files from their respective examples.

> [!IMPORTANT]
> **Never commit `.env` or `.env.local` files to version control.** Only commit the `.example` files.

### Root `.env.local`
Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```
**Variables:**
*   `NEXT_PUBLIC_BACKEND_URL`: URL of the Rust backend (e.g., `http://localhost:3001`). It must point at the Rust backend, never at a mock or a different server.
*   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Get a free ID from [cloud.walletconnect.com](https://cloud.walletconnect.com/). *(Note: A placeholder will cause a cosmetic relay-connection warning but won't block local functionality).*

### Backend `.env`
Inside the `backend/` directory, copy `.env.example` to `.env`:
```bash
cd backend
cp .env.example .env
cd ..
```
**Variables:**
*   `DATABASE_URL`: Connection string for PostgreSQL (e.g., `postgres://evault:evault@localhost:5432/evault`).
*   `RPC_URL`: Local Hardhat node URL (e.g., `http://127.0.0.1:8545`).
*   `CONTRACT_ADDRESS`: The deployed contract address (filled in Step 4).
*   `ENCRYPTION_KEY_HEX`: Must be exactly 64 hex characters (32 bytes), NO `0x` prefix. **Generate your own:**
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
*   `SESSION_SECRET`: Secret key for JWT sessions.
*   `PORT`: Port for the backend HTTP server (defaults to `3001`).
*   `RUST_LOG`: Log level for structured logging (defaults to `info`).

> [!NOTE]
> `SIWE_EXPECTED_DOMAIN` and `SIWE_EXPECTED_CHAIN_ID` are hardcoded in `backend/src/api/auth.rs` (`localhost:3000` and `31337`), so the app must be opened at exactly `http://localhost:3000` and MetaMask must be on chain `31337`.

## 4. Start Order

> [!WARNING]
> **Order Matters!** The backend reads the `CONTRACT_ADDRESS` only once at startup. If you deploy the contract *after* starting the backend, or forget to update the `.env`, the backend will silently point to a nonexistent contract and API calls will fail.

1.  **Start Database:**
    ```bash
    cd backend
    docker compose up -d
    cd ..
    ```
    *Wait a few seconds for Postgres to become healthy.*
2.  **Start Hardhat Node:**
    ```bash
    npx hardhat node
    ```
    *(Or use the alias `npm run chain`). Leave this terminal running. It will print 20 funded test accounts with private keys.*
3.  **Deploy Contract:** Open a new terminal in the project root:
    ```bash
    npm run deploy:local
    ```
    *This deploys the contract, prints the address, and auto-writes it to `lib/contract.json`.*
    *Sanity check: on a fresh node with no earlier transactions, the first deploy from Hardhat Account #0 normally lands at `0x5FbDB2315678afecb367f032d93F642f64180aa3`. A different address is not an error by itself, but it means the node already had transactions.*
    > [!NOTE]
    > `lib/contract.json` is tracked in git because `lib/contract.ts` imports it and a fresh clone needs it to build. `npm run deploy:local` rewrites it. Commit it only when the contract ABI actually changed; if only the address differs, run `git checkout lib/contract.json` so a local deploy never lands in a commit.
4.  **Update `.env` File:**
    Copy the deployed contract address from Step 3 and paste it into:
    *   `backend/.env` as `CONTRACT_ADDRESS`

    *(Note: The frontend reads the address and ABI directly from `lib/contract.json`, which is written automatically by `npm run deploy:local` in Step 3).*
5.  **Start Backend:**
    ```bash
    cd backend
    cargo run
    ```
    *Confirm that migrations apply successfully and it logs "Listening" on port 3001.*
6.  **Start Frontend:** In a new terminal at the project root:
    ```bash
    npm run dev
    ```
7.  **Verify, do not assume:**
    ```bash
    curl.exe http://localhost:3001/health
    ```
    It must print `ok`. To confirm the contract really exists on your node (replace the address with yours):
    ```powershell
    Invoke-RestMethod -Uri http://127.0.0.1:8545 -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_getCode","params":["<CONTRACT_ADDRESS>","latest"],"id":1}'
    ```
    The `result` must be a long hex string. A bare `0x` means nothing is deployed at that address.

### Restarting the Hardhat node

Stopping the node wipes the whole chain. After any restart:
1.  Re-run `npm run deploy:local`, update `backend/.env`, and restart the backend (it reads the address only at startup).
2.  In MetaMask, clear the activity tab data for each account you use (Settings > Advanced > Clear activity tab data). Otherwise MetaMask's cached nonce is ahead of the fresh chain and transactions hang or fail.
3.  Postgres keeps its vault rows across node restarts while on-chain vault IDs start again from 0. If vault lists look wrong after a restart, reset the **dev** database (this deletes all local dev data): `cd backend`, then `docker compose down -v`, then `docker compose up -d`.

## 5. MetaMask Setup for Local Testing

To test the application locally with Hardhat:

1.  **Add Custom Network to MetaMask:**
    *   **Network Name:** Hardhat Local (or anything)
    *   **RPC URL:** `http://127.0.0.1:8545`
    *   **Chain ID:** `31337`
    *   **Currency Symbol:** `ETH`
2.  **Import Accounts:**
    *   Import at least **two** accounts using the private keys printed in the `npx hardhat node` terminal.
    *   Use one as the **Admin** and the other as the **User/Grantee**.
    *   Always identify accounts by **address**, not by MetaMask's name. MetaMask names imported accounts in the order you import them ("Imported Account 1", "2", ...), which will not match Hardhat's numbering.

    | Hardhat account | Address | Role in tests |
    | :--- | :--- | :--- |
    | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Admin (creates vaults, grants, revokes) |
    | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | User who is granted access |
    | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Never granted; must be denied |

3.  **Simultaneous Testing Tip:**
    To run both an Admin and User session simultaneously without conflicts, use two separate browser profiles, or use an Incognito window. Ensure "Allow in Incognito" is enabled for the MetaMask extension in your browser settings. A single browser profile has one active MetaMask account shared by every tab, so switching it to the user also changes the wallet the admin tab sees. A failure seen while mixing accounts in one profile is inconclusive, not a bug report.
4.  **Normal warning:** MetaMask shows an "HTTP" warning for `localhost:3000`. That is expected in local dev.

## 6. Running Tests

*   **Smart Contract Tests:**
    ```bash
    npx hardhat test
    ```
*   **Backend Integration Tests:** stop `cargo run` first (see the file-lock gotcha below), then:
    ```bash
    cd backend
    cargo test -- --test-threads=1
    ```
    Expected: 23 tests pass (4 encryption, 8 auth_integration, 2 blockchain_integration, 7 vault_integration, 2 vault_repository). The full run is slow because the chain-unavailable tests wait out RPC timeouts; the last full run took roughly 3.5 minutes.
    > [!IMPORTANT]
    > `--test-threads=1` is **strictly required**. Running backend tests in parallel will cause nonce collisions against the shared local Hardhat deployer account.
    > *(Note: The single `ignored` doctest under `blockchain_integration` is expected. It belongs to the `ethers-rs` abigen-generated code, not our test suite).*

## 7. Manual End-to-End Checklist

Run this with the Admin in one browser profile and the User in another (see Section 5). Tick each box only after you have seen the result, and note the date. The backend tests already cover the revoked, expired, no-permission and wrong-wallet cases, so these steps confirm the same behavior through the real UI.

> [!NOTE]
> **Data Projection vs. Live Reveal:** The vault list and its ACTIVE/EXPIRED badge shown in the UI are read from the local database projection and can, in principle, drift from on-chain state. The actual authorization decision when revealing a secret always re-reads the blockchain live and ignores this cached state — confirmed by the on-chain-only revoke test in item 4 below.

- [x] 1. **Create vault.** As Admin (`0xf39F...2266`) on `localhost:3000/admin`, create a vault with a distinctive secret (for example `evault-test-7391`). MetaMask must show a transaction confirmation, the Hardhat node terminal must print an `eth_sendTransaction`, and the Network tab must show a **201** from `localhost:3001`. *(Verified 2026-10-04, cold-start run — Hardhat block #2, backend log "Vault created" with correct wallet/vault_id).*
- [x] 2. **Grant.** Grant the vault to Account #1 (`0x7099...79C8`) with an expiry **in the future** (at least a day ahead). Confirm the transaction and check for a successful `permissions` call. *(Verified 2026-10-04, cold-start run — Hardhat block #3).*
- [x] 3. **Reveal (granted).** As Account #1 on `localhost:3000/user`, sign in, check the page says "signed in as 0x70997970...79C8", and click Reveal Secret. The text must match what was typed in step 1 exactly. *(Verified 2026-10-04, cold-start run — backend log "Secret retrieved" at 06:59:25 matching wallet 0x70997... and the correct vault_id).*
- [x] 4. **Revoke, then reveal without refreshing.** Revoke on-chain as Admin. On the still-open user page, click Reveal Secret again. It must be denied ("Access denied or expired"). If the secret still appears, the backend is not re-checking the chain live; stop and fix it. *(Verified 2026-10-04 twice — once via the app UI [success banner, vault list emptied for the user], once via direct on-chain revoke through the Hardhat console bypassing the app entirely [database untouched, vault still listed ACTIVE in the UI, but the next Reveal attempt correctly returned "Access denied or expired"] — this specifically proves the backend re-checks the chain live on every request rather than trusting a cached or database-stored permission state).*
- [x] 5. **Owner self-grant / self-access.** As Admin, grant a vault to the admin's own address with a future expiry, then Reveal Secret on the admin page. It should show the secret. *(Verified 2026-10-04 — admin was denied on its own vaults until it explicitly granted its own address, then could reveal; this confirms there is no implicit owner bypass of the permission check).*
- [ ] 6. **Expiry.** Grant with an expiry a few minutes ahead, wait until it passes, then click Reveal. It must be denied. If it still reveals, send any transaction to mine a block (Hardhat's block time only moves when blocks are mined) and retry.
- [x] 7. **Ungranted account.** Sign in as Account #2 and try the same vault. It must be denied. *(Verified 2026-10-04 via UI [empty list] — backend-level denial already covered by automated test suite `test_no_permission_denied`).*
- [ ] 8. **Browser session drop checks.** Switch MetaMask account and disconnect wallet; confirm session token is dropped and UI resets without full page reload.

Record the result and date next to each box before a demo.

## 8. Known Gotchas & Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **PowerShell `curl` warning** | If you see a warning about parsing HTML when using `curl` in PowerShell, it's safe to accept (Y), or explicitly use `curl.exe` to bypass the native PowerShell alias. |
| **"Access is denied (os error 5)"** | When running `cargo test` or `cargo run` on Windows, this means a process is still holding the `.exe` file locked, most often your own running `cargo run`. Stop it with Ctrl+C, or find and kill it (`Get-Process evault-backend \| Stop-Process`) before retrying. |
| **`EADDRINUSE` on port 8545** | Another Hardhat node is already running in the background. Find it with `netstat -ano \| findstr :8545`, note the PID, and kill it using `taskkill /PID <PID> /F`. |
| **Wallet Address Comparisons** | All wallet addresses are normalized to lowercase at write time before touching the database (see `backend/src/utils.rs` `normalize_address()`). This is a deliberate invariant. Any new code that inserts or compares a `wallet_address` column must go through this helper, not add its own `.to_lowercase()`. |
| **Transactions hang or fail after restarting the Hardhat node** | MetaMask's cached nonce is stale. Settings > Advanced > Clear activity tab data, for each account used. |
| **Grant fails with "gas limit is 21000000 and exceeds transaction gas cap of 16777216"** | The message is misleading. The real cause is that `grantAccess` reverted (gas estimation failed, so MetaMask used a huge default), most commonly due to an expiry date in the past. The admin form now rejects an expiry less than 2 minutes in the future before MetaMask opens; keep this in mind as a note for anyone calling the contract or API directly. The Hardhat node terminal prints the real revert reason. |
| **Grant or other call returns 400 with `%20` in the URL / "UUID parsing failed: found ` ` at 0"** | The Vault UUID field had leading or trailing whitespace. The form now trims whitespace, but keep this in mind as a note for anyone calling the API directly. |
| **Port 3000 busy / Next.js shifts port** | If port 3000 is busy, Next.js moves to another port (e.g. 3002) and sign-in fails against the backend's hardcoded `localhost:3000` SIWE domain; port 3001 would also clash with the backend. Free port 3000 instead (`netstat -ano \| findstr :3000` and kill the process). |
| **Sign-in rejected** | Check, in this order: the app is opened at `http://localhost:3000` (domain `localhost:3000` is hardcoded in `backend/src/api/auth.rs`); MetaMask is on Hardhat Local (chain `31337`, also hardcoded); `CONTRACT_ADDRESS` in `backend/.env` matches a contract that exists on the current node. These have caused most past auth bugs. |
| **UI looks healthy but the backend is down** | It should not. The frontend must show an error when the backend or chain is unreachable. If it shows data anyway, something is serving fake data; see Team Rules. |

## 9. Team Rules

*   **No mocks, no silent fallbacks.** The frontend must never serve fake or cached data when the backend or chain is unreachable. A past commit that added a mock API fallback made the UI look healthy while hiding real failures, and was reverted (see Section 10).
*   **`main` must always pass the backend tests and `npm run build`.** Work on a branch and open a pull request instead of pushing to `main`.
*   **"Done" requires pasted evidence:** the raw `cargo test -- --test-threads=1` output, the raw `npm run build` output, and the manual-checklist steps (Section 7) the change touches. A description of what should work does not count.
*   **Changes to auth, encryption, or the vault/secret authorization path** need the full diff reviewed by a second person before merging.

## 10. Current Project Status

*   **Completed:** Full backend (contract, SIWE auth, blockchain reads, encryption, vault/permissions API, all tested; 23/23 backend tests passing as of 2026-10-02). Frontend core loop and authorization invariants verified manually against the real backend on cold-start run (2026-10-04): Admin create vault, grant access, granted user sign-in and reveal, owner self-grant, direct on-chain revoke live check, and ungranted account rejection. Grant and revoke forms trim inputs and the grant form rejects an expiry less than 2 minutes ahead; the SIWE session is dropped when the connected wallet changes or disconnects; hardcoded sample grants were removed from the home page. One-command startup script (`npm run dev:up`) verified clean cold-start execution on 2026-10-04 from a fully torn-down state (Docker volume removed, all ports freed) with preflight 6/6 passing.
*   **History:** Commit `8363456` reverted three commits (`33e20ff`, `bede957`, `5fe408d`) that added a mock API fallback, a separate Node.js server (`server.js`) and a stray submodule pointer (`idp/unishare`). The repository state matches `a8b3952` plus later work.
*   **Needs manual verification and recording (Section 7):** expiry denial (Item 6) and browser behavior of session drop on wallet switch/disconnect (Item 8).
*   **Reveal Authorization Policy:** A grant is required for every wallet, including the vault owner; the owner can reveal their own vault by granting their own address. Reveal authorization is read live from the chain on every request (no caching), fails closed with 503 if the RPC is down, and decryption only happens after authorization succeeds.
*   **Known issues and limitations:**
    *   **Database projection vs. on-chain truth:** The vault list and its ACTIVE/EXPIRED badge shown in the UI are read from the local database projection and can, in principle, drift from on-chain state. The actual authorization decision when revealing a secret always re-reads the blockchain live and ignores this cached state — confirmed by the on-chain-only revoke test in Section 7 item 4.
    *   A signed-in wallet can distinguish a nonexistent vault (404) from a denied one (403); vault IDs are random UUIDs, so this is low severity.
*   **Deferred / Not Yet Implemented:**
    *   Sepolia testnet deployment (`npm run deploy:sepolia` script exists in `package.json` for Arbitrum Sepolia, but Sepolia deployment is untested).
    *   Reconciliation of old documentation.
    *   Activity-log UI (table data source is currently stubbed/commented out).
    *   Polished error and transaction-status screens.