use axum::{
    async_trait,
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::{
    nonce::{generate_nonce, store_nonce},
    session::{issue_session, verify_session},
    siwe::verify_siwe,
    AuthError,
};

#[derive(Clone)]
pub struct AuthState {
    pub pool: PgPool,
    pub session_secret: String,
}

#[derive(Deserialize)]
pub struct NonceQuery {
    address: String,
}

#[derive(Serialize, Deserialize)]
pub struct NonceResponse {
    pub nonce: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
}

pub async fn get_nonce(
    State(state): State<Arc<AuthState>>,
    Query(query): Query<NonceQuery>,
) -> Result<Json<NonceResponse>, AuthError> {
    let nonce = generate_nonce();
    let ttl_seconds = 300; // 5 minutes

    store_nonce(&state.pool, &query.address, &nonce, ttl_seconds).await?;

    let expires_at = (chrono::Utc::now() + chrono::Duration::seconds(ttl_seconds))
        .to_rfc3339();

    Ok(Json(NonceResponse { nonce, expires_at }))
}

#[derive(Serialize, Deserialize)]
pub struct VerifyRequest {
    pub message: String,
    pub signature: String,
}

#[derive(Serialize, Deserialize)]
pub struct VerifyResponse {
    pub authenticated: bool,
    #[serde(rename = "walletAddress")]
    pub wallet_address: String,
    pub token: String,
}

pub async fn verify_signature(
    State(state): State<Arc<AuthState>>,
    Json(payload): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, AuthError> {
    // We expect the domain and chain_id to be verified, in production these might come from config
    let expected_domain = "localhost";
    let expected_chain_id = 1;

    let verify_result = verify_siwe(
        &state.pool,
        &payload.message,
        &payload.signature,
        expected_domain,
        expected_chain_id,
    )
    .await;

    match verify_result {
        Ok(wallet_address) => {
            // Write success audit log
            let _ = sqlx::query!(
                r#"
                INSERT INTO audit_logs (id, wallet_address, action, metadata)
                VALUES ($1, $2, $3, $4)
                "#,
                Uuid::new_v4(),
                wallet_address,
                "AUTH_SUCCESS",
                serde_json::json!({"method": "siwe"})
            )
            .execute(&state.pool)
            .await;

            let token = issue_session(&state.pool, &wallet_address, &state.session_secret).await?;
            Ok(Json(VerifyResponse {
                authenticated: true,
                wallet_address,
                token,
            }))
        }
        Err(err) => {
            let reason = match &err {
                AuthError::InvalidSignature(msg) => msg.clone(),
                AuthError::NonceExpired => "Nonce expired".to_string(),
                AuthError::NonceUsed => "Nonce already used".to_string(),
                _ => "Unknown error".to_string(),
            };

            // Parse wallet address from message if possible for auditing, otherwise null
            let parsed_wallet = siwe::Message::from_str(&payload.message)
                .map(|m| format!("0x{}", hex::encode(m.address)))
                .ok();

            // Write failure audit log
            let _ = sqlx::query!(
                r#"
                INSERT INTO audit_logs (id, wallet_address, action, metadata)
                VALUES ($1, $2, $3, $4)
                "#,
                Uuid::new_v4(),
                parsed_wallet,
                "AUTH_FAILURE",
                serde_json::json!({"reason": reason})
            )
            .execute(&state.pool)
            .await;

            Err(err)
        }
    }
}

pub fn router(pool: PgPool, session_secret: String) -> Router {
    let state = Arc::new(AuthState {
        pool,
        session_secret,
    });

    Router::new()
        .route("/auth/nonce", get(get_nonce))
        .route("/auth/verify", post(verify_signature))
        .with_state(state)
}

// Extractor middleware for protected routes
pub struct AuthenticatedWallet(pub String);

#[async_trait]
impl FromRequestParts<Arc<AuthState>> for AuthenticatedWallet {
    type Rejection = AuthError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AuthState>,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or(AuthError::InvalidToken)?;

        let wallet_address = verify_session(&state.pool, auth_header, &state.session_secret).await?;
        Ok(AuthenticatedWallet(wallet_address))
    }
}
