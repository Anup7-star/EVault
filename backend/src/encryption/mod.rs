//! Symmetric encryption/decryption for vault secrets.
//!
//! Algorithm: AES-256-GCM (authenticated encryption).
//! Key source: ENCRYPTION_KEY_HEX env var (32 bytes, hex-encoded).

// TODO: load_key() -> [u8; 32] — decode ENCRYPTION_KEY_HEX, validate length
// TODO: encrypt(key, plaintext: &[u8]) -> (ciphertext, iv, auth_tag)
//       - generate 12-byte random IV per operation
//       - return raw bytes for storage as BYTEA columns
// TODO: decrypt(key, ciphertext, iv, auth_tag) -> Vec<u8>
// TODO: derive_document_key(master_key, vault_id) for per-vault key derivation (HKDF)

pub fn load_key() {
    // TODO
}

pub fn encrypt() {
    // TODO
}

pub fn decrypt() {
    // TODO
}
