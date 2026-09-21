//! Auth nonce generation and lifecycle management (stored in `auth_nonces`).

// TODO: generate cryptographically-random nonce and persist to DB
// TODO: look up nonce by wallet_address — return None if expired or already used
// TODO: mark nonce as used (set used_at = NOW())
// TODO: purge expired nonces (background task)

pub async fn generate_nonce() {
    // TODO
}

pub async fn validate_nonce() {
    // TODO
}

pub async fn consume_nonce() {
    // TODO
}
