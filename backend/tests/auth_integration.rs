use axum::{routing::get, Router};
use ethers::signers::{LocalWallet, Signer};
use reqwest::Client;
use sqlx::PgPool;
use std::net::SocketAddr;
use time::OffsetDateTime;
use tokio::net::TcpListener;

use evault_backend::api::auth::{router as auth_router, AuthenticatedWallet, VerifyRequest, VerifyResponse, NonceResponse};

#[sqlx::test]
async fn test_siwe_auth_flow(pool: PgPool) {
    let session_secret = "test_secret_for_jwt".to_string();

    let state = std::sync::Arc::new(evault_backend::api::auth::AuthState {
        pool: pool.clone(),
        session_secret: session_secret.clone(),
    });

    // Setup dummy protected route
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

    let client = Client::new();
    let base_url = format!("http://{}", addr);

    // 1. Generate test wallet
    let wallet = LocalWallet::new(&mut rand::thread_rng());
    let address = format!("0x{}", hex::encode(wallet.address().as_bytes()));

    // 2. Fetch Nonce
    let nonce_res = client
        .get(format!("{}/auth/nonce?address={}", base_url, address))
        .send()
        .await
        .unwrap();
    assert!(nonce_res.status().is_success());
    let nonce_data: NonceResponse = nonce_res.json().await.unwrap();
    let nonce = nonce_data.nonce;

    // 3. Create SIWE Message
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

    // 4. Sign Message
    let signature = wallet.sign_message(&message).await.unwrap();
    let signature_hex = format!("0x{}", signature);

    // 5. Verify SIWE
    let verify_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message: message.clone(),
            signature: signature_hex.clone(),
        })
        .send()
        .await
        .unwrap();

    let status = verify_res.status();
    if !status.is_success() {
        let err_body = verify_res.text().await.unwrap();
        panic!("Verify failed with {}: {}", status, err_body);
    }
    let verify_data: VerifyResponse = verify_res.json().await.unwrap();
    assert!(verify_data.authenticated);
    assert_eq!(verify_data.wallet_address.to_lowercase(), address.to_lowercase());
    
    let token = verify_data.token;

    // 6. Test protected route with token
    let protected_res = client
        .get(format!("{}/protected", base_url))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await
        .unwrap();
    assert!(protected_res.status().is_success());
    let body = protected_res.text().await.unwrap();
    assert_eq!(body, format!("Hello {}", address));

    // 7. Test missing token returns 401
    let unauth_res = client
        .get(format!("{}/protected", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(unauth_res.status().as_u16(), 401);

    // 8. Test reused nonce fails
    let reused_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message: message.clone(),
            signature: signature_hex.clone(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(reused_res.status().as_u16(), 400); // 400 Bad Request for Nonce Used

    // 9. Test wrong domain fails
    let mut bad_domain_msg_struct = siwe_msg.clone();
    bad_domain_msg_struct.domain = "bad-domain.com".parse().unwrap();
    bad_domain_msg_struct.nonce = "new_nonce_12345".into();
    let bad_domain_msg = bad_domain_msg_struct.to_string();
    let bad_domain_sig = format!("0x{}", wallet.sign_message(&bad_domain_msg).await.unwrap());
    
    let domain_fail_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message: bad_domain_msg,
            signature: bad_domain_sig,
        })
        .send()
        .await
        .unwrap();
    assert_eq!(domain_fail_res.status().as_u16(), 401);

    // 10. Test wrong chain ID fails
    let mut bad_chain_msg_struct = siwe_msg.clone();
    bad_chain_msg_struct.chain_id = 999;
    bad_chain_msg_struct.nonce = "new_nonce_12345".into();
    let bad_chain_msg = bad_chain_msg_struct.to_string();
    let bad_chain_sig = format!("0x{}", wallet.sign_message(&bad_chain_msg).await.unwrap());
    
    let chain_fail_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message: bad_chain_msg,
            signature: bad_chain_sig,
        })
        .send()
        .await
        .unwrap();
    assert_eq!(chain_fail_res.status().as_u16(), 401);

    // 11. Test tampered signature fails
    let tampered_sig = "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    let tamper_fail_res = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest {
            message: message.clone(),
            signature: tampered_sig.to_string(),
        })
        .send()
        .await
        .unwrap();
    assert_eq!(tamper_fail_res.status().as_u16(), 401);
}
