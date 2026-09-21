//! Auth HTTP handlers.
//!
//! Routes (to be wired in main.rs):
//!   POST /auth/nonce    — generate and return a nonce for a given wallet
//!   POST /auth/verify   — verify SIWE signature, create session, return token
//!   POST /auth/logout   — revoke current session

// TODO: POST /auth/nonce   → auth::nonce::generate_nonce()
// TODO: POST /auth/verify  → auth::siwe::verify_siwe_signature() + auth::session::create_session()
// TODO: POST /auth/logout  → auth::session::revoke_session()

pub async fn get_nonce() {
    // TODO
}

pub async fn verify_signature() {
    // TODO
}

pub async fn logout() {
    // TODO
}
