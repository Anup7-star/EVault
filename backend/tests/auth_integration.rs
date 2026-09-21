use axum::{routing::get, Router};
use ethers::signers::{LocalWallet, Signer};
use reqwest::Client;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use time::OffsetDateTime;
use tokio::net::TcpListener;

use evault_backend::api::auth::{
    router as auth_router, AuthenticatedWallet, NonceResponse, VerifyRequest, VerifyResponse,
};

async fn setup_app(pool: PgPool) -> (String, Client, PgPool) {
    let session_secret = "test_secret_for_jwt".to_string();

    let state = std::sync::Arc::new(evault_backend::api::auth::AuthState {
        pool: pool.clone(),
        session_secret: session_secret.clone(),
    });

    let app = Router::new()
        .merge(auth_router(pool.clone(), session_secret.clone()))
        .route(
            "/protected",
            get(|wallet: AuthenticatedWallet| async move { format!("Hello {}", wallet.0) })
                .with_state(state),
        );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (format!("http://{}", addr), Client::new(), pool)
}

async fn generate_wallet_and_nonce(base_url: &str, client: &Client) -> (LocalWallet, String, String) {
    let wallet = LocalWallet::new(&mut rand::thread_rng());
    let address = format!("0x{}", hex::encode(wallet.address().as_bytes()));

    let nonce_res = client
        .get(format!("{}/auth/nonce?address={}", base_url, address))
        .send()
        .await
        .unwrap();
    assert!(nonce_res.status().is_success());
    let nonce_data: NonceResponse = nonce_res.json().await.unwrap();
    (wallet, address, nonce_data.nonce)
}

#[sqlx::test]
async fn test_siwe_auth_flow(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;
    let (wallet, address, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let issued_at = OffsetDateTime::now_utc();
    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce: nonce.clone(),
        issued_at: issued_at.into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message,
            signature,
        })
        .send()
        .await
        .unwrap();

    assert!(verify_res.status().is_success());
    let verify_data: VerifyResponse = verify_res.json().await.unwrap();
    assert!(verify_data.authenticated);
    
    let token = verify_data.token;

    let protected_res = client
        .get(format!("{}/protected", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    assert!(protected_res.status().is_success());
    let body = protected_res.text().await.unwrap();
    assert_eq!(body, format!("Hello {}", address));
}

#[sqlx::test]
async fn test_reused_nonce_fails(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let issued_at = OffsetDateTime::now_utc();
    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce: nonce.clone(),
        issued_at: issued_at.into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    // First attempt works
    client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message: message.clone(), signature: signature.clone() })
        .send()
        .await
        .unwrap();

    // Second attempt fails
    let reused_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap();

    assert_eq!(reused_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_expired_nonce_fails(pool: PgPool) {
    let (base_url, client, pool) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    // Fast-forward expiration in db
    sqlx::query!(
        "UPDATE auth_nonces SET expires_at = NOW() - INTERVAL '1 hour' WHERE nonce = $1",
        nonce
    )
    .execute(&pool)
    .await
    .unwrap();

    let issued_at = OffsetDateTime::now_utc();
    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce,
        issued_at: issued_at.into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap();

    assert_eq!(verify_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_wrong_domain_fails(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let siwe_msg = siwe::Message {
        domain: "bad-domain.com".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce,
        issued_at: OffsetDateTime::now_utc().into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap();

    assert_eq!(verify_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_wrong_chain_id_fails(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 999, // Wrong chain id
        nonce,
        issued_at: OffsetDateTime::now_utc().into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap();

    assert_eq!(verify_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_tampered_signature_fails(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce,
        issued_at: OffsetDateTime::now_utc().into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let tampered_sig = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature: tampered_sig.into() })
        .send()
        .await
        .unwrap();

    assert_eq!(verify_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_missing_auth_header_returns_401(pool: PgPool) {
    let (base_url, client, _) = setup_app(pool).await;

    let unauth_res = client
        .get(format!("{}/protected", base_url))
        .send()
        .await
        .unwrap();

    assert_eq!(unauth_res.status().as_u16(), 401);
}

#[sqlx::test]
async fn test_revoked_session_rejected(pool: PgPool) {
    let (base_url, client, pool) = setup_app(pool).await;
    let (wallet, _, nonce) = generate_wallet_and_nonce(&base_url, &client).await;

    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce,
        issued_at: OffsetDateTime::now_utc().into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap();

    let verify_data: VerifyResponse = verify_res.json().await.unwrap();
    let token = verify_data.token;

    // Hash the token directly
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let token_hash = hex::encode(hasher.finalize());

    // Revoke the session programmatically by directly calling db logic, since we don't have an endpoint yet
    evault_backend::auth::session::revoke_session(&pool, &token_hash).await.unwrap();

    let protected_res = client
        .get(format!("{}/protected", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();

    // The middleware should return 401 Unauthorized for revoked session
    assert_eq!(protected_res.status().as_u16(), 401);
}
