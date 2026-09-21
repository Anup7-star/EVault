//! Vault authorization — checks that a caller wallet holds an active, non-expired
//! permission for a given vault before allowing a sensitive operation.

// TODO: require_owner(pool, vault_id, caller_wallet) — error if caller != vault owner
// TODO: require_active_permission(pool, vault_id, caller_wallet) — check DB + on-chain
// TODO: require_role(pool, vault_id, caller_wallet, min_role) — role-based gate
// TODO: sync_permission_from_chain(pool, vault_id, wallet) — pull on-chain grant into DB

pub async fn require_owner() {
    // TODO
}

pub async fn require_active_permission() {
    // TODO
}

pub async fn require_role() {
    // TODO
}

pub async fn sync_permission_from_chain() {
    // TODO
}
