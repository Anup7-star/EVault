//! Vault business-logic service layer.
//!
//! Coordinates between the repository (DB), blockchain client, and encryption layers.

// TODO: create_vault — persist metadata to DB, call blockchain::contract_client::create_vault
// TODO: get_vault — fetch by UUID, enforce read permission
// TODO: list_vaults_for_wallet — query vaults owned by or accessible to a wallet
// TODO: update_vault_status — sync on-chain status into DB
// TODO: store_encrypted_secret — encrypt payload, persist ciphertext + IV + auth_tag
// TODO: retrieve_encrypted_secret — enforce permission, decrypt and return plaintext

pub async fn create_vault() {
    // TODO
}

pub async fn get_vault() {
    // TODO
}

pub async fn list_vaults_for_wallet() {
    // TODO
}

pub async fn store_encrypted_secret() {
    // TODO
}

pub async fn retrieve_encrypted_secret() {
    // TODO
}
