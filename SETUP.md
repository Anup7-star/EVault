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
*   `NEXT_PUBLIC_BACKEND_URL`: URL of the Rust backend (e.g., `http://localhost:3001`).
*   `NEXT_PUBLIC_CONTRACT_ADDRESS`: The deployed address of the smart contract (you will fill this in Step 4).
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
*   `SIWE_EXPECTED_DOMAIN`: Expected domain for SIWE (must be `localhost:3000` for local dev).
*   `SIWE_EXPECTED_CHAIN_ID`: Expected chain ID for SIWE (must be `31337` for Hardhat local node).

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
    *Leave this terminal running. It will print 20 funded test accounts with private keys.*
3.  **Deploy Contract:** Open a new terminal in the project root:
    ```bash
    npm run deploy:local
    ```
    *This deploys the contract, prints the address, and auto-writes it to `lib/contract.json`.*
4.  **Update `.env` Files:**
    Copy the deployed contract address from Step 3 and paste it into:
    *   `backend/.env` as `CONTRACT_ADDRESS`
    *   `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`
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
3.  **Simultaneous Testing Tip:**
    To run both an Admin and User session simultaneously without conflicts, use two separate browser profiles, or use an Incognito window. Ensure "Allow in Incognito" is enabled for the MetaMask extension in your browser settings. (A single browser window cannot cleanly act as two different wallets simultaneously across tabs).

## 6. Running Tests

*   **Smart Contract Tests:**
    ```bash
    npx hardhat test
    ```
*   **Backend Integration Tests:**
    ```bash
    cd backend
    cargo test -- --test-threads=1
    ```
    > [!IMPORTANT]
    > `--test-threads=1` is **strictly required**. Running backend tests in parallel will cause nonce collisions against the shared local Hardhat deployer account.
    > *(Note: The single `ignored` doctest under `blockchain_integration` is expected. It belongs to the `ethers-rs` abigen-generated code, not our test suite).*

## 7. Known Gotchas & Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **PowerShell `curl` warning** | If you see a warning about parsing HTML when using `curl` in PowerShell, it's safe to accept (Y), or explicitly use `curl.exe` to bypass the native PowerShell alias. |
| **"Access is denied (os error 5)"** | When running `cargo test` or `cargo run` on Windows, this means a zombie process is still holding the `.exe` file locked. Find and kill it (`Get-Process evault-backend \| Stop-Process`) before retrying. |
| **`EADDRINUSE` on port 8545** | Another Hardhat node is already running in the background. Find it with `netstat -ano \| findstr :8545`, note the PID, and kill it using `taskkill /PID <PID> /F`. |
| **Wallet Address Comparisons** | All wallet addresses are normalized to lowercase at write time before touching the database (see `backend/src/utils.rs` `normalize_address()`). This is a deliberate invariant. Any new code that inserts or compares a `wallet_address` column must go through this helper, not add its own `.to_lowercase()`. |

## 8. Current Project Status

*   **Completed:** Full backend (contract, SIWE auth, blockchain reads, encryption, vault/permissions API — all tested). Frontend core loop (admin create/grant/revoke, user sign-in/reveal) is wired and manually verified on the admin side. User-side reveal flow is implemented but not yet manually verified end-to-end — this is the next thing to test.
*   **Deferred / Not Yet Implemented:**
    *   Sepolia testnet deployment.
    *   Reconciliation of old documentation.
    *   Activity-log UI (table data source is currently stubbed/commented out).
    *   Polished error and transaction-status screens.
