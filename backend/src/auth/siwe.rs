use crate::auth::AuthError;
use siwe::Message;
use sqlx::PgPool;
use std::str::FromStr;
use time::OffsetDateTime;

pub async fn verify_siwe(
    pool: &PgPool,
    message: &str,
    signature: &str,
    expected_domain: &str,
    expected_chain_id: u64,
) -> Result<String, AuthError> {
    let msg = Message::from_str(message)
        .map_err(|_| AuthError::InvalidSignature("Invalid SIWE message".into()))?;

    if msg.domain.as_str() != expected_domain {
        return Err(AuthError::InvalidSignature("Domain mismatch".into()));
    }
    if msg.chain_id != expected_chain_id {
        return Err(AuthError::InvalidSignature("Chain ID mismatch".into()));
    }

    let now = OffsetDateTime::now_utc();
    if !msg.valid_at(&now) {
        return Err(AuthError::InvalidSignature("Message is expired or not yet valid".into()));
    }

    let issued_at = msg.issued_at.as_ref();
    if now - *issued_at > time::Duration::minutes(5) {
        return Err(AuthError::InvalidSignature("Message was issued too long ago".into()));
    }

    let sig_bytes = hex::decode(signature.trim_start_matches("0x"))
        .map_err(|_| AuthError::InvalidSignature("Invalid signature format".into()))?;

    let sig_array: &[u8; 65] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| AuthError::InvalidSignature("Invalid signature length".into()))?;

    let _verified = msg.verify_eip191(sig_array)
        .map_err(|_| AuthError::InvalidSignature("Signature verification failed".into()))?;

    // The siwe crate returns the recovered bytes on success or we can just get from msg.address
    let address = format!("0x{}", hex::encode(msg.address));

    crate::auth::nonce::consume_nonce(pool, &address, msg.nonce.as_str()).await?;

    Ok(address)
}
