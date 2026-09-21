use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptedPayload {
    pub ciphertext: Vec<u8>,
    pub iv: [u8; 12],
    pub auth_tag: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum EncryptionError {
    #[error("Decryption failed: Auth tag verification failed or data corrupted")]
    DecryptionFailed,
}

// Prototype limitation: single static key from env. Production requires KMS-backed key generation/rotation per TRD §10 — not solved here.
pub fn load_encryption_key() -> [u8; 32] {
    let hex_key = std::env::var("ENCRYPTION_KEY_HEX")
        .expect("ENCRYPTION_KEY_HEX must be set");
    
    if hex_key.len() != 64 {
        panic!("ENCRYPTION_KEY_HEX must be exactly 64 characters (32 bytes)");
    }

    let mut key = [0u8; 32];
    hex::decode_to_slice(&hex_key, &mut key)
        .expect("ENCRYPTION_KEY_HEX must be valid hex");
    
    key
}

pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> EncryptedPayload {
    let cipher = Aes256Gcm::new(key.into());

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes); // 96-bits

    // AES-GCM encryption
    let mut ciphertext_with_tag = cipher
        .encrypt(nonce, plaintext)
        .expect("Encryption failure is conceptually impossible here");

    let auth_tag = ciphertext_with_tag.split_off(ciphertext_with_tag.len() - 16);

    EncryptedPayload {
        ciphertext: ciphertext_with_tag,
        iv: nonce_bytes,
        auth_tag,
    }
}

pub fn decrypt(payload: &EncryptedPayload, key: &[u8; 32]) -> Result<Vec<u8>, EncryptionError> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(&payload.iv);

    let mut ciphertext_with_tag = payload.ciphertext.clone();
    ciphertext_with_tag.extend_from_slice(&payload.auth_tag);

    cipher
        .decrypt(nonce, ciphertext_with_tag.as_ref())
        .map_err(|_| EncryptionError::DecryptionFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let key = [0x42; 32];
        let plaintext = b"Top secret vault data";

        let encrypted = encrypt(plaintext, &key);
        let decrypted = decrypt(&encrypted, &key).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        let key = [0x42; 32];
        let plaintext = b"Top secret vault data";

        let mut encrypted = encrypt(plaintext, &key);
        // Tamper with ciphertext
        encrypted.ciphertext[0] ^= 0x01;

        let result = decrypt(&encrypted, &key);
        assert!(matches!(result, Err(EncryptionError::DecryptionFailed)));
    }

    #[test]
    fn test_tampered_auth_tag_fails() {
        let key = [0x42; 32];
        let plaintext = b"Top secret vault data";

        let mut encrypted = encrypt(plaintext, &key);
        // Tamper with auth tag
        encrypted.auth_tag[0] ^= 0x01;

        let result = decrypt(&encrypted, &key);
        assert!(matches!(result, Err(EncryptionError::DecryptionFailed)));
    }

    #[test]
    fn test_nonce_is_never_reused() {
        let key = [0x42; 32];
        let plaintext = b"Top secret vault data";

        let encrypted1 = encrypt(plaintext, &key);
        let encrypted2 = encrypt(plaintext, &key);

        assert_ne!(encrypted1.iv, encrypted2.iv);
        assert_ne!(encrypted1.ciphertext, encrypted2.ciphertext);
    }
}
