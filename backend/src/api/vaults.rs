//! Vault HTTP handlers — all routes protected by `AuthenticatedWallet`.
//!
//! Routes wired in `router()`:
//!   POST   /vaults
//!   GET    /vaults
//!   GET    /vaults/:vaultId
//!   GET    /vaults/:vaultId/secret
//!   GET    /vaults/:vaultId/permissions
//!   POST   /vaults/:vaultId/permissions
//!   DELETE /vaults/:vaultId/permissions/:wallet

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use ethers::types::Address;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    audit::{record, AuditAction, AuditEvent},
    blockchain::contract_client::{AuthzResult, ContractClient},
    encryption::{decrypt, encrypt, load_encryption_key},
    vault::repository::{get_secret, store_secret},
};

use super::auth::AuthenticatedWallet;

// ── App state ────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct VaultState {
    pub pool: PgPool,
    pub contract: Arc<ContractClient>,
    pub session_secret: String,
}

impl crate::api::auth::HasAuthState for VaultState {
    fn pool(&self) -> &PgPool { &self.pool }
    fn session_secret(&self) -> &str { &self.session_secret }
}

// ── Error type ───────────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum VaultError {
    NotFound,
    Forbidden(String),
    ServiceUnavailable(String),
    Internal(String),
    BadRequest(String),
    Database(sqlx::Error),
}

impl From<sqlx::Error> for VaultError {
    fn from(e: sqlx::Error) -> Self {
        VaultError::Database(e)
    }
}

impl IntoResponse for VaultError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            VaultError::NotFound => (StatusCode::NOT_FOUND, json!({"error": "Not found"})),
            VaultError::Forbidden(msg) => (StatusCode::FORBIDDEN, json!({"error": msg})),
            VaultError::ServiceUnavailable(msg) => {
                (StatusCode::SERVICE_UNAVAILABLE, json!({"error": msg}))
            }
            VaultError::Internal(msg) => {
                (StatusCode::INTERNAL_SERVER_ERROR, json!({"error": msg}))
            }
            VaultError::BadRequest(msg) => (StatusCode::BAD_REQUEST, json!({"error": msg})),
            VaultError::Database(e) => {
                tracing::error!(error = %e, "Database error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({"error": "Database error"}),
                )
            }
        };
        (status, Json(body)).into_response()
    }
}

// ── Response shapes ───────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultResponse {
    pub id: Uuid,
    pub blockchain_vault_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub owner_wallet: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultListItem {
    pub id: Uuid,
    pub blockchain_vault_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub your_role: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionItem {
    pub wallet_address: String,
    pub role: String,
    pub expires_at: DateTime<Utc>,
    pub active: bool,
}

// ── Request bodies ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVaultRequest {
    pub blockchain_vault_id: i64,
    pub name: String,
    pub description: Option<String>,
    pub storage_reference: String,
    pub secret: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantPermissionRequest {
    pub wallet_address: String,
    pub role: i32,
    pub expires_at: DateTime<Utc>,
}

// ── Helper: resolve request-id from extensions ───────────────────────────────

fn request_id_from_state() -> Uuid {
    Uuid::new_v4() // per-call UUID; real request-id propagation via tower middleware
}

// ── POST /vaults ─────────────────────────────────────────────────────────────

pub async fn create_vault(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Json(body): Json<CreateVaultRequest>,
) -> Result<(StatusCode, Json<VaultResponse>), VaultError> {
    let request_id = request_id_from_state();
    let owner_wallet = wallet.0.clone();

    // Orphan-resource risk: if this endpoint is called but the on-chain vault doesn't
    // actually exist yet at the given blockchainVaultId, later access checks will fail
    // closed (no permission on-chain) — accepted mitigation for prototype; no reconciliation
    // job needed.
    let vault_id = Uuid::new_v4();
    let row = sqlx::query!(
        r#"
        INSERT INTO vaults (id, blockchain_vault_id, name, description, owner_wallet, storage_reference, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
        RETURNING id, blockchain_vault_id, name, description, owner_wallet, status, created_at
        "#,
        vault_id,
        body.blockchain_vault_id,
        body.name,
        body.description,
        owner_wallet,
        body.storage_reference,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| {
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint() == Some("vaults_blockchain_vault_id_key") {
                return VaultError::BadRequest("blockchainVaultId already registered".to_string());
            }
        }
        VaultError::from(e)
    })?;

    // Encrypt and store secret
    let key = load_encryption_key();
    let payload = encrypt(body.secret.as_bytes(), &key);
    store_secret(&state.pool, vault_id, payload)
        .await
        .map_err(VaultError::Database)?;

    // Write VAULT_CREATED audit log
    record(
        &state.pool,
        AuditEvent {
            action: AuditAction::VaultCreated,
            wallet_address: Some(&owner_wallet),
            vault_id: Some(vault_id),
            request_id: Some(request_id),
            metadata: Some(json!({"blockchain_vault_id": body.blockchain_vault_id})),
        },
    )
    .await;

    tracing::info!(
        request_id = %request_id,
        vault_id = %vault_id,
        wallet = %owner_wallet,
        "Vault created"
    );

    Ok((
        StatusCode::CREATED,
        Json(VaultResponse {
            id: row.id,
            blockchain_vault_id: row.blockchain_vault_id,
            name: row.name,
            description: row.description,
            owner_wallet: row.owner_wallet,
            status: row.status,
            created_at: row.created_at,
        }),
    ))
}

// ── GET /vaults ───────────────────────────────────────────────────────────────

pub async fn list_vaults(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
) -> Result<Json<Vec<VaultListItem>>, VaultError> {
    let caller = &wallet.0;

    // Fetch all vaults
    let rows = sqlx::query!(
        r#"SELECT id, blockchain_vault_id, name, description, owner_wallet, status FROM vaults"#
    )
    .fetch_all(&state.pool)
    .await?;

    let caller_addr: Address = caller.parse().map_err(|_| VaultError::BadRequest("Invalid wallet address".into()))?;

    let mut items = Vec::new();
    for row in rows {
        if row.owner_wallet.to_lowercase() == caller.to_lowercase() {
            // Owner sees their vaults without role/expiry
            items.push(VaultListItem {
                id: row.id,
                blockchain_vault_id: row.blockchain_vault_id,
                name: row.name,
                description: row.description,
                status: row.status,
                your_role: None,
                expires_at: None,
            });
        } else {
            // Check on-chain permission — demo-scale, no caching
            match state.contract.get_permission(row.blockchain_vault_id as u64, caller_addr).await {
                Ok((true, expires_at, role)) => {
                    items.push(VaultListItem {
                        id: row.id,
                        blockchain_vault_id: row.blockchain_vault_id,
                        name: row.name,
                        description: row.description,
                        status: row.status,
                        your_role: Some(role),
                        expires_at: Some(expires_at),
                    });
                }
                _ => {
                    // No access or chain error — skip this vault for the caller
                }
            }
        }
    }

    Ok(Json(items))
}

// ── GET /vaults/:vaultId ─────────────────────────────────────────────────────

pub async fn get_vault(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Path(vault_id): Path<Uuid>,
) -> Result<Json<VaultResponse>, VaultError> {
    let caller = &wallet.0;

    let row = sqlx::query!(
        r#"SELECT id, blockchain_vault_id, name, description, owner_wallet, status, created_at FROM vaults WHERE id = $1"#,
        vault_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(VaultError::NotFound)?;

    // Check authorization: owner OR active on-chain permission
    let is_owner = row.owner_wallet.to_lowercase() == caller.to_lowercase();
    if !is_owner {
        let caller_addr: Address = caller
            .parse()
            .map_err(|_| VaultError::Forbidden("Invalid wallet address".into()))?;
        match state.contract.get_permission(row.blockchain_vault_id as u64, caller_addr).await {
            Ok((true, _, _)) => {}
            _ => return Err(VaultError::Forbidden("Access denied".into())),
        }
    }

    Ok(Json(VaultResponse {
        id: row.id,
        blockchain_vault_id: row.blockchain_vault_id,
        name: row.name,
        description: row.description,
        owner_wallet: row.owner_wallet,
        status: row.status,
        created_at: row.created_at,
    }))
}

// ── GET /vaults/:vaultId/secret ──────────────────────────────────────────────
// Critical path — INV-002 through INV-008 apply.
// Ordering is enforced: auth check MUST pass BEFORE ciphertext retrieval/decryption.

pub async fn get_vault_secret(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Path(vault_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, VaultError> {
    let request_id = request_id_from_state();
    let caller = wallet.0.clone();

    // Step 1 & 2: Look up vault, 404 if missing
    let row = sqlx::query!(
        r#"SELECT blockchain_vault_id FROM vaults WHERE id = $1"#,
        vault_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(VaultError::NotFound)?;

    // Step 3: Authorization check BEFORE touching ciphertext
    let caller_addr: Address = caller
        .parse()
        .map_err(|_| VaultError::Forbidden("Invalid wallet address".into()))?;

    let authz = state.contract.checked_authorize(row.blockchain_vault_id as u64, caller_addr).await;
    match authz {
        AuthzResult::ChainUnavailable => {
            // Fail closed — 503, log nothing sensitive
            tracing::warn!(
                request_id = %request_id,
                vault_id = %vault_id,
                "Authorization service temporarily unavailable"
            );
            return Err(VaultError::ServiceUnavailable(
                "authorization service temporarily unavailable".to_string(),
            ));
        }
        AuthzResult::Denied(reason) => {
            // Write ACCESS_DENIED audit log (wallet+vault_id, no secret content)
            record(
                &state.pool,
                AuditEvent {
                    action: AuditAction::AccessDenied,
                    wallet_address: Some(&caller),
                    vault_id: Some(vault_id),
                    request_id: Some(request_id),
                    metadata: Some(json!({"reason": reason})),
                },
            )
            .await;
            return Err(VaultError::Forbidden("Access denied or expired".to_string()));
        }
        AuthzResult::Allowed { .. } => {
            // Authorized — continue to ciphertext retrieval
        }
    }

    // Step 4: Retrieve ciphertext — only reached after authorization passes
    let payload = get_secret(&state.pool, vault_id)
        .await
        .map_err(VaultError::Database)?
        .ok_or(VaultError::NotFound)?;

    // Step 5: Decrypt
    let key = load_encryption_key();
    let plaintext = decrypt(&payload, &key).map_err(|_e| {
        // Write DECRYPTION_FAILURE audit log, no partial data
        let pool = state.pool.clone();
        let caller_clone = caller.clone();
        let request_id_clone = request_id;
        tokio::spawn(async move {
            record(
                &pool,
                AuditEvent {
                    action: AuditAction::DecryptionFailure,
                    wallet_address: Some(&caller_clone),
                    vault_id: Some(vault_id),
                    request_id: Some(request_id_clone),
                    metadata: Some(json!({"reason": "AES-GCM auth tag verification failed"})),
                },
            )
            .await;
        });
        VaultError::Internal("decryption failed".to_string())
    })?;

    // Step 6: Write SECRET_RETRIEVED audit log — never plaintext in metadata
    record(
        &state.pool,
        AuditEvent {
            action: AuditAction::SecretRetrieved,
            wallet_address: Some(&caller),
            vault_id: Some(vault_id),
            request_id: Some(request_id),
            metadata: None,
        },
    )
    .await;

    tracing::info!(
        request_id = %request_id,
        vault_id = %vault_id,
        wallet = %caller,
        "Secret retrieved"
    );

    Ok(Json(json!({
        "secret": String::from_utf8_lossy(&plaintext)
    })))
}

// ── GET /vaults/:vaultId/permissions  (owner-only) ───────────────────────────

pub async fn list_permissions(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Path(vault_id): Path<Uuid>,
) -> Result<Json<Vec<PermissionItem>>, VaultError> {
    let caller = &wallet.0;

    // Verify owner
    let row = sqlx::query!(
        r#"SELECT owner_wallet FROM vaults WHERE id = $1"#,
        vault_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(VaultError::NotFound)?;

    if row.owner_wallet.to_lowercase() != caller.to_lowercase() {
        return Err(VaultError::Forbidden("Owner only".to_string()));
    }

    let perms = sqlx::query!(
        r#"SELECT wallet_address, role, expires_at, active FROM permissions WHERE vault_id = $1"#,
        vault_id
    )
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<PermissionItem> = perms
        .into_iter()
        .map(|p| PermissionItem {
            wallet_address: p.wallet_address,
            role: p.role,
            expires_at: p.expires_at,
            active: p.active,
        })
        .collect();

    Ok(Json(items))
}

// ── POST /vaults/:vaultId/permissions  (owner-only) ──────────────────────────
// IMPORTANT: This does NOT submit a blockchain transaction — client-side admin wallet does that.
// This endpoint only upserts the local permissions table projection.
// Blockchain remains authoritative — this projection can drift, and /secret always reads
// the chain directly, never this table.

pub async fn grant_permission(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Path(vault_id): Path<Uuid>,
    Json(body): Json<GrantPermissionRequest>,
) -> Result<StatusCode, VaultError> {
    let request_id = request_id_from_state();
    let caller = wallet.0.clone();

    // Verify owner
    let row = sqlx::query!(
        r#"SELECT owner_wallet FROM vaults WHERE id = $1"#,
        vault_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(VaultError::NotFound)?;

    if row.owner_wallet.to_lowercase() != caller.to_lowercase() {
        return Err(VaultError::Forbidden("Owner only".to_string()));
    }

    let role_str = body.role.to_string();

    // Upsert local permissions projection
    let perm_id = Uuid::new_v4();
    sqlx::query!(
        r#"
        INSERT INTO permissions (id, vault_id, wallet_address, role, expires_at, active, granted_by)
        VALUES ($1, $2, $3, $4, $5, true, $6)
        ON CONFLICT (vault_id, wallet_address) DO UPDATE
        SET role = EXCLUDED.role,
            expires_at = EXCLUDED.expires_at,
            active = true,
            granted_by = EXCLUDED.granted_by,
            updated_at = NOW()
        "#,
        perm_id,
        vault_id,
        body.wallet_address,
        role_str,
        body.expires_at,
        caller,
    )
    .execute(&state.pool)
    .await?;

    record(
        &state.pool,
        AuditEvent {
            action: AuditAction::AccessGranted,
            wallet_address: Some(&caller),
            vault_id: Some(vault_id),
            request_id: Some(request_id),
            metadata: Some(json!({
                "grantee": body.wallet_address,
                "role": body.role,
                "expires_at": body.expires_at.to_rfc3339(),
            })),
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ── DELETE /vaults/:vaultId/permissions/:wallet  (owner-only) ─────────────────

pub async fn revoke_permission(
    State(state): State<Arc<VaultState>>,
    wallet: AuthenticatedWallet,
    Path((vault_id, grantee_wallet)): Path<(Uuid, String)>,
) -> Result<StatusCode, VaultError> {
    let request_id = request_id_from_state();
    let caller = wallet.0.clone();

    // Verify owner
    let row = sqlx::query!(
        r#"SELECT owner_wallet FROM vaults WHERE id = $1"#,
        vault_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(VaultError::NotFound)?;

    if row.owner_wallet.to_lowercase() != caller.to_lowercase() {
        return Err(VaultError::Forbidden("Owner only".to_string()));
    }

    sqlx::query!(
        r#"
        UPDATE permissions SET active = false, updated_at = NOW()
        WHERE vault_id = $1 AND wallet_address = $2
        "#,
        vault_id,
        grantee_wallet,
    )
    .execute(&state.pool)
    .await?;

    record(
        &state.pool,
        AuditEvent {
            action: AuditAction::AccessRevoked,
            wallet_address: Some(&caller),
            vault_id: Some(vault_id),
            request_id: Some(request_id),
            metadata: Some(json!({"revoked_wallet": grantee_wallet})),
        },
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(pool: PgPool, contract: Arc<ContractClient>, session_secret: String) -> Router {
    let state = Arc::new(VaultState {
        pool,
        contract,
        session_secret,
    });

    Router::new()
        .route("/vaults", post(create_vault).get(list_vaults))
        .route("/vaults/:vaultId", get(get_vault))
        .route("/vaults/:vaultId/secret", get(get_vault_secret))
        .route(
            "/vaults/:vaultId/permissions",
            get(list_permissions).post(grant_permission),
        )
        .route(
            "/vaults/:vaultId/permissions/:wallet",
            delete(revoke_permission),
        )
        .with_state(state)
}
