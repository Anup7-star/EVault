//! Utility functions used across the application.

/// Normalizes an Ethereum wallet address for consistent database storage and comparison.
/// 
/// Invariant: Every wallet_address column in the database (vaults, permissions, sessions, auth_nonces)
/// ALWAYS holds lowercase addresses. This helper must be used BEFORE any insert or lookup.
pub fn normalize_address(address: &str) -> String {
    address.to_lowercase()
}
