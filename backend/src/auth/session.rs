//! Session creation, validation, and revocation (stored in `sessions`).

// TODO: create session — hash a random token, persist to DB, return raw token to caller
// TODO: validate session — hash bearer token, look up in DB, check expiry + revoked_at
// TODO: revoke session — set revoked_at = NOW()
// TODO: extract wallet_address from validated session for use as request identity

pub async fn create_session() {
    // TODO
}

pub async fn validate_session() {
    // TODO
}

pub async fn revoke_session() {
    // TODO
}
