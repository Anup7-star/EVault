use crate::auth::AuthError;
use crate::utils::normalize_address;
use chrono::{Duration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use sqlx::PgPool;
use uuid::Uuid;

pub fn generate_nonce() -> String {
    // Generate a random 16-character alphanumeric string per EIP-4361 (min 8)
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(16)
        .map(char::from)
        .collect()
}

pub async fn store_nonce(
    pool: &PgPool,
    wallet_address: &str,
    nonce: &str,
    ttl_seconds: i64,
) -> Result<(), AuthError> {
    let id = Uuid::new_v4();
    let expires_at = Utc::now() + Duration::seconds(ttl_seconds);
    let normalized_wallet = normalize_address(wallet_address);

    sqlx::query!(
        r#"
        INSERT INTO auth_nonces (id, wallet_address, nonce, expires_at)
        VALUES ($1, $2, $3, $4)
        "#,
        id,
        normalized_wallet,
        nonce,
        expires_at,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn consume_nonce(
    pool: &PgPool,
    wallet_address: &str,
    nonce: &str,
) -> Result<(), AuthError> {
    let mut tx = pool.begin().await?;
    let normalized_wallet = normalize_address(wallet_address);

    let row = sqlx::query!(
        r#"
        SELECT id, expires_at, used_at
        FROM auth_nonces
        WHERE wallet_address = $1 AND nonce = $2
        FOR UPDATE
        "#,
        normalized_wallet,
        nonce
    )
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(record) = row {
        let now = Utc::now();
        if record.used_at.is_some() {
            return Err(AuthError::NonceUsed);
        }
        if record.expires_at < now {
            return Err(AuthError::NonceExpired);
        }

        sqlx::query!(
            r#"
            UPDATE auth_nonces
            SET used_at = $1
            WHERE id = $2
            "#,
            now,
            record.id
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    } else {
        Err(AuthError::InvalidNonce)
    }
}
