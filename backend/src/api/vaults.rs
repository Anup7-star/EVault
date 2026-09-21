//! Vault HTTP handlers.
//!
//! Routes (to be wired in main.rs):
//!   GET    /vaults           — list vaults accessible to caller
//!   POST   /vaults           — create a new vault (off-chain record; on-chain tx done by FE)
//!   GET    /vaults/:id       — get vault details
//!   PUT    /vaults/:id       — update vault metadata
//!   POST   /vaults/:id/sync  — pull latest on-chain state into DB
//!   POST   /vaults/:id/secrets — store encrypted secret
//!   GET    /vaults/:id/secrets — retrieve (and decrypt) secret

// TODO: GET  /vaults
// TODO: POST /vaults
// TODO: GET  /vaults/:id
// TODO: PUT  /vaults/:id
// TODO: POST /vaults/:id/sync
// TODO: POST /vaults/:id/secrets
// TODO: GET  /vaults/:id/secrets

pub async fn list_vaults() {
    // TODO
}

pub async fn create_vault() {
    // TODO
}

pub async fn get_vault() {
    // TODO
}

pub async fn sync_vault() {
    // TODO
}

pub async fn store_secret() {
    // TODO
}

pub async fn retrieve_secret() {
    // TODO
}
