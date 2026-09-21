//! Audit log writer — append-only structured event log in `audit_logs`.

use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditAction {
    VaultCreated,
    SecretRetrieved,
    AccessDenied,
    DecryptionFailure,
    AccessGranted,
    AccessRevoked,
    AuthSuccess,
    AuthFailure,
}

impl AuditAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuditAction::VaultCreated => "VAULT_CREATED",
            AuditAction::SecretRetrieved => "SECRET_RETRIEVED",
            AuditAction::AccessDenied => "ACCESS_DENIED",
            AuditAction::DecryptionFailure => "DECRYPTION_FAILURE",
            AuditAction::AccessGranted => "ACCESS_GRANTED",
            AuditAction::AccessRevoked => "ACCESS_REVOKED",
            AuditAction::AuthSuccess => "AUTH_SUCCESS",
            AuditAction::AuthFailure => "AUTH_FAILURE",
        }
    }
}

pub struct AuditEvent<'a> {
    pub action: AuditAction,
    pub wallet_address: Option<&'a str>,
    pub vault_id: Option<Uuid>,
    pub request_id: Option<Uuid>,
    pub metadata: Option<serde_json::Value>,
}

/// Insert a new audit log entry. Errors are logged but not propagated —
/// an audit failure must never prevent the primary operation from completing.
pub async fn record(pool: &PgPool, event: AuditEvent<'_>) {
    let id = Uuid::new_v4();
    let result = sqlx::query!(
        r#"
        INSERT INTO audit_logs (id, wallet_address, action, vault_id, request_id, metadata, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        "#,
        id,
        event.wallet_address,
        event.action.as_str(),
        event.vault_id,
        event.request_id,
        event.metadata,
    )
    .execute(pool)
    .await;

    if let Err(e) = result {
        tracing::error!(error = %e, action = event.action.as_str(), "Failed to write audit log");
    }
}
