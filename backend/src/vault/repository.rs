//! Vault repository — raw SQL queries against `vaults`, `permissions`,
//! and `encrypted_secrets` tables.

// TODO: insert_vault(tx, NewVault) -> Vault
// TODO: find_vault_by_id(pool, uuid) -> Option<Vault>
// TODO: find_vault_by_blockchain_id(pool, bigint) -> Option<Vault>
// TODO: list_vaults_by_owner(pool, wallet) -> Vec<Vault>
// TODO: update_vault_status(pool, uuid, status) -> ()
// TODO: insert_permission(pool, NewPermission) -> Permission
// TODO: find_permission(pool, vault_id, wallet) -> Option<Permission>
// TODO: revoke_permission(pool, vault_id, wallet) -> ()
// TODO: insert_encrypted_secret(pool, NewSecret) -> EncryptedSecret
// TODO: find_secret_by_vault(pool, vault_id) -> Option<EncryptedSecret>

pub async fn insert_vault() {
    // TODO
}

pub async fn find_vault_by_id() {
    // TODO
}

pub async fn insert_permission() {
    // TODO
}

pub async fn find_permission() {
    // TODO
}

pub async fn revoke_permission() {
    // TODO
}

pub async fn insert_encrypted_secret() {
    // TODO
}

pub async fn find_secret_by_vault() {
    // TODO
}
