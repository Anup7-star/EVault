//! Permissions HTTP handlers.
//!
//! Routes (to be wired in main.rs):
//!   GET    /vaults/:id/permissions             — list all active permissions
//!   POST   /vaults/:id/permissions             — grant access (mirrors on-chain grantAccess)
//!   DELETE /vaults/:id/permissions/:wallet     — revoke access
//!   GET    /vaults/:id/permissions/:wallet     — check single wallet permission

// TODO: GET    /vaults/:id/permissions
// TODO: POST   /vaults/:id/permissions   → vault::authorization + blockchain sync
// TODO: DELETE /vaults/:id/permissions/:wallet
// TODO: GET    /vaults/:id/permissions/:wallet

pub async fn list_permissions() {
    // TODO
}

pub async fn grant_permission() {
    // TODO
}

pub async fn revoke_permission() {
    // TODO
}

pub async fn check_permission() {
    // TODO
}
