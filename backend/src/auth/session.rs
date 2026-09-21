use crate::auth::AuthError;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

// Session mechanism: JWT bearer token, since TRD §22 leaves this open.
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    wallet_address: String,
    exp: usize,
    iat: usize,
}

pub async fn issue_session(
    pool: &PgPool,
    wallet_address: &str,
    secret: &str,
) -> Result<String, AuthError> {
    let now = Utc::now();
    let expires_at = now + Duration::days(1);

    let claims = Claims {
        wallet_address: wallet_address.to_string(),
        exp: expires_at.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|_| AuthError::Database(sqlx::Error::Protocol("Token encoding failed".into())))?;

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());
    let id = Uuid::new_v4();

    sqlx::query!(
        r#"
        INSERT INTO sessions (id, wallet_address, session_token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5)
        "#,
        id,
        wallet_address,
        token_hash,
        expires_at,
        now
    )
    .execute(pool)
    .await?;

    Ok(token)
}

pub async fn verify_session(
    pool: &PgPool,
    token: &str,
    secret: &str,
) -> Result<String, AuthError> {
    let mut validation = Validation::default();
    validation.validate_exp = true;

    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|e| match e.kind() {
        jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
        _ => AuthError::InvalidToken,
    })?;

    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    let record = sqlx::query!(
        r#"
        SELECT revoked_at
        FROM sessions
        WHERE session_token_hash = $1
        "#,
        token_hash
    )
    .fetch_optional(pool)
    .await?;

    if let Some(record) = record {
        if record.revoked_at.is_some() {
            return Err(AuthError::SessionRevoked);
        }
    } else {
        return Err(AuthError::InvalidToken);
    }

    Ok(token_data.claims.wallet_address)
}

pub async fn revoke_session(pool: &PgPool, token_hash: &str) -> Result<(), AuthError> {
    sqlx::query!(
        r#"
        UPDATE sessions
        SET revoked_at = $1
        WHERE session_token_hash = $2
        "#,
        Utc::now(),
        token_hash
    )
    .execute(pool)
    .await?;

    Ok(())
}
