//! Ethereum JSON-RPC client for the VaultAccessRegistry contract.
//!
//! Uses the contract ABI from `lib/contract.json` (shared with the Next.js frontend).
//! All calls are read-only (eth_call); transaction submission is delegated to the
//! frontend wallet.

// TODO: initialise a provider from RPC_URL env var (e.g. via alloy or ethers-rs)
// TODO: has_access(vault_id: u64, wallet: &str) -> bool
// TODO: get_permission(vault_id: u64, wallet: &str) -> (active, expires_at, role)
// TODO: get_vault_count() -> u64
// TODO: watch_access_granted events for real-time sync (future)

pub async fn has_access() {
    // TODO
}

pub async fn get_permission() {
    // TODO
}

pub async fn get_vault_count() {
    // TODO
}
