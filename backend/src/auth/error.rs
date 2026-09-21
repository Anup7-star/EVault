use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum AuthError {
    Database(sqlx::Error),
    InvalidNonce,
    NonceExpired,
    NonceUsed,
    InvalidSignature(String),
    SessionRevoked,
    InvalidToken,
    TokenExpired,
}

impl From<sqlx::Error> for AuthError {
    fn from(err: sqlx::Error) -> Self {
        AuthError::Database(err)
    }
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AuthError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Database error"),
            AuthError::InvalidNonce => (StatusCode::BAD_REQUEST, "Invalid nonce"),
            AuthError::NonceExpired => (StatusCode::BAD_REQUEST, "Nonce expired"),
            AuthError::NonceUsed => (StatusCode::BAD_REQUEST, "Nonce already used"),
            AuthError::InvalidSignature(msg) => (StatusCode::UNAUTHORIZED, msg.as_str()),
            AuthError::SessionRevoked => (StatusCode::UNAUTHORIZED, "Session revoked"),
            AuthError::InvalidToken => (StatusCode::UNAUTHORIZED, "Invalid session token"),
            AuthError::TokenExpired => (StatusCode::UNAUTHORIZED, "Session expired"),
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
