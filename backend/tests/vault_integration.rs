//! Vault API integration tests.
//!
//! Requires a local Hardhat node running. Deploy is in-process via ethers-rs ContractFactory
//! (same pattern as blockchain_integration.rs — never shell out to `npx`).
//!
//! Test cases:
//!   1. test_vault_happy_path            — create vault, grant permission on-chain, SIWE, GET /secret
//!   2. test_wrong_wallet_denied         — authenticated as a wallet with no on-chain grant → 403
//!   3. test_no_permission_denied        — valid JWT but never granted access → 403
//!   4. test_revoked_permission_denied   — grant on-chain, call grantAccess with past expiry → 403
//!   5. test_expired_permission_denied   — grant with near-future expiry, mine past it → 403
//!   6. test_chain_unavailable_503       — point ContractClient at unreachable RPC → 503
//!   7. test_tampered_ciphertext_500     — corrupt stored ciphertext, confirm 500 not garbage

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use ethers::prelude::*;
use evault_backend::{
    api::{
        auth::{router as auth_router, NonceResponse, VerifyRequest, VerifyResponse},
        vaults::router as vault_router,
    },
    blockchain::contract_client::{ContractClient, VaultAccessRegistry},
    encryption::{encrypt, load_encryption_key},
    vault::repository::store_secret,
};
use reqwest::Client;
use serde_json::{json, Value};
use sqlx::PgPool;
use time::OffsetDateTime;
use tokio::net::TcpListener;
use uuid::Uuid;

const HARDHAT_RPC_URL: &str = "http://127.0.0.1:8545";
// Hardhat account #0 private key
const DEPLOYER_KEY: &str = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// ── Test infrastructure ───────────────────────────────────────────────────────

/// Deploy a fresh contract and return client + signer + deployed address string.
async fn deploy_contract() -> (ContractClient, Address, Arc<SignerMiddleware<Provider<Http>, LocalWallet>>) {
    let provider = Provider::<Http>::try_from(HARDHAT_RPC_URL).unwrap();
    if provider.get_chainid().await.is_err() {
        panic!("Hardhat node is not running. Run `npx hardhat node` in the project root.");
    }

    let contract_json_str = std::fs::read_to_string("abi/VaultAccessRegistry.json")
        .expect("Failed to read abi/VaultAccessRegistry.json");
    let contract_json: serde_json::Value = serde_json::from_str(&contract_json_str).unwrap();
    let abi: ethers::abi::Abi = serde_json::from_value(contract_json["abi"].clone()).unwrap();
    let bytecode = ethers::core::types::Bytes::from(
        hex::decode(&contract_json["bytecode"].as_str().unwrap()[2..]).unwrap(),
    );

    let wallet: LocalWallet = DEPLOYER_KEY.parse().unwrap();
    let fresh_provider = Provider::<Http>::try_from(HARDHAT_RPC_URL).unwrap();
    let chain_id = fresh_provider.get_chainid().await.unwrap().as_u64();
    let wallet = wallet.with_chain_id(chain_id);
    let signer = Arc::new(SignerMiddleware::new(fresh_provider, wallet));

    let factory = ethers::contract::ContractFactory::new(abi, bytecode, signer.clone());
    let deployed = factory.deploy(()).unwrap().send().await.unwrap();
    let address = deployed.address();

    let client = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", address)).unwrap();
    (client, address, signer)
}

/// Spin up the full app (auth + vault routers) against the given pool and contract client.
async fn setup_app(pool: PgPool, contract: Arc<ContractClient>) -> (String, Client) {
    let session_secret = "test_vault_secret_key_1234567890".to_string();

    let app = Router::new()
        .merge(auth_router(pool.clone(), session_secret.clone()))
        .merge(vault_router(pool.clone(), contract, session_secret));

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    (format!("http://{}", addr), Client::new())
}

/// Complete SIWE sign-in for a wallet and return the bearer token.
async fn siwe_login(base_url: &str, client: &Client, wallet: &LocalWallet) -> String {
    let address = format!("0x{}", hex::encode(wallet.address().as_bytes()));

    let nonce_res: NonceResponse = client
        .get(format!("{}/auth/nonce?address={}", base_url, address))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let siwe_msg = siwe::Message {
        domain: "localhost".parse().unwrap(),
        address: wallet.address().0,
        statement: Some("Sign in to EVault".into()),
        uri: "http://localhost".parse().unwrap(),
        version: siwe::Version::V1,
        chain_id: 1,
        nonce: nonce_res.nonce.clone(),
        issued_at: OffsetDateTime::now_utc().into(),
        expiration_time: None,
        not_before: None,
        request_id: None,
        resources: vec![],
    };

    let message = siwe_msg.to_string();
    let signature = format!("0x{}", wallet.sign_message(&message).await.unwrap());

    let verify_res: VerifyResponse = client
        .post(format!("{}/auth/verify", base_url))
        .json(&VerifyRequest { message, signature })
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    verify_res.token
}

/// Create a vault via the API. Returns the vault id.
async fn api_create_vault(
    base_url: &str,
    client: &Client,
    token: &str,
    blockchain_vault_id: u64,
    secret: &str,
) -> Uuid {
    let res = client
        .post(format!("{}/vaults", base_url))
        .bearer_auth(token)
        .json(&json!({
            "blockchainVaultId": blockchain_vault_id,
            "name": "Test Vault",
            "description": null,
            "storageReference": "ipfs://QmTest",
            "secret": secret,
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 201, "Expected 201 from create_vault");
    let body: Value = res.json().await.unwrap();
    body["id"].as_str().unwrap().parse().unwrap()
}

// ── Test 1: Full happy path ───────────────────────────────────────────────────

#[sqlx::test]
async fn test_vault_happy_path(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool, contract_client).await;

    // Owner wallet = hardhat account #0
    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    // Create vault on-chain
    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding
        .create_vault("ipfs://QmTest".into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    let vault_count = {
        let _provider = Provider::<Http>::try_from(HARDHAT_RPC_URL).unwrap();
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;

    // POST /vaults — register metadata + secret
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "my secret value").await;

    // Grant access to a fresh grantee wallet
    let grantee_wallet = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let grantee_addr = grantee_wallet.address();
    let expires_in_future = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 120;

    contract_binding
        .grant_access(blockchain_vault_id.into(), grantee_addr, 2, expires_in_future.into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    // Grantee logs in and fetches secret
    let grantee_token = siwe_login(&base_url, &client, &grantee_wallet).await;
    let secret_res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&grantee_token)
        .send()
        .await
        .unwrap();

    assert_eq!(secret_res.status().as_u16(), 200);
    let body: Value = secret_res.json().await.unwrap();
    assert_eq!(body["secret"].as_str().unwrap(), "my secret value");
}

// ── Test 2: Wrong wallet (no grant) → 403 ────────────────────────────────────

#[sqlx::test]
async fn test_wrong_wallet_denied(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool, contract_client).await;

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding.create_vault("ipfs://test".into()).send().await.unwrap().await.unwrap();
    let vault_count = {
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "secret").await;

    // Attacker wallet — no grant at all
    let attacker = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let attacker_token = siwe_login(&base_url, &client, &attacker).await;

    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&attacker_token)
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 403);
    let body: Value = res.json().await.unwrap();
    assert_eq!(body["error"].as_str().unwrap(), "Access denied or expired");
}

// ── Test 3: No permission (same as test 2 but cleaner naming) ─────────────────

#[sqlx::test]
async fn test_no_permission_denied(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool, contract_client).await;

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding.create_vault("ipfs://test".into()).send().await.unwrap().await.unwrap();
    let vault_count = {
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "secret").await;

    // A completely fresh wallet that was never granted access
    let no_perm_wallet = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let no_perm_token = siwe_login(&base_url, &client, &no_perm_wallet).await;

    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&no_perm_token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 403);
}

// ── Test 4: Revoked permission (expiry in past via grantAccess) → 403 ────────

#[sqlx::test]
async fn test_revoked_permission_denied(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool, contract_client).await;

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding.create_vault("ipfs://test".into()).send().await.unwrap().await.unwrap();
    let vault_count = {
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "secret").await;

    let grantee = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let grantee_addr = grantee.address();

    // Grant with expiry far in the future
    let expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 120;

    contract_binding
        .grant_access(blockchain_vault_id.into(), grantee_addr, 2, expires.into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    // Revoke access on-chain before expiry
    contract_binding
        .revoke_access(blockchain_vault_id.into(), grantee_addr)
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    let grantee_token = siwe_login(&base_url, &client, &grantee).await;
    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&grantee_token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 403);
}

// ── Test 5: Expired permission (grant then mine past expiry) → 403 ───────────

#[sqlx::test]
async fn test_expired_permission_denied(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool, contract_client).await;

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding.create_vault("ipfs://test".into()).send().await.unwrap().await.unwrap();
    let vault_count = {
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "secret").await;

    let grantee = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let grantee_addr = grantee.address();
    let expires_soon = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 3;

    contract_binding
        .grant_access(blockchain_vault_id.into(), grantee_addr, 2, expires_soon.into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    // Sleep past expiry
    tokio::time::sleep(Duration::from_secs(4)).await;

    // Mine a block to advance Hardhat's block.timestamp
    let dummy = LocalWallet::new(&mut rand::thread_rng()).address();
    let _ = signer.send_transaction(TransactionRequest::pay(dummy, 1), None).await.unwrap().await.unwrap();

    let grantee_token = siwe_login(&base_url, &client, &grantee).await;
    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&grantee_token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 403);
}

// ── Test 6: Chain unavailable → 503 ──────────────────────────────────────────

#[sqlx::test]
async fn test_chain_unavailable_503(pool: PgPool) {
    // Use an unreachable RPC URL
    let dead_client = Arc::new(
        ContractClient::new("http://127.0.0.1:1", "0x0000000000000000000000000000000000000000").unwrap()
    );
    let (base_url, client) = setup_app(pool.clone(), dead_client).await;

    // We need a real auth token — spin up real contract just for login
    let (_real_contract, _real_address, signer) = deploy_contract().await;
    // We need session_secret to match. Since setup_app uses "test_vault_secret_key_1234567890"
    // and the auth router is inside setup_app already, we can just SIWE-login against it.

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let _token = siwe_login(&base_url, &client, &owner_wallet).await;

    // Insert a vault row directly so the endpoint can find it
    let vault_id = Uuid::new_v4();
    let owner_addr = format!("0x{}", hex::encode(owner_wallet.address().as_bytes()));
    sqlx::query!(
        r#"INSERT INTO vaults (id, blockchain_vault_id, name, owner_wallet, storage_reference, status)
           VALUES ($1, 99999, 'Test', $2, 'ipfs://x', 'ACTIVE')"#,
        vault_id,
        owner_addr,
    )
    .execute(&pool)
    .await
    .unwrap();

    // Store a fake secret so it passes the secret-lookup step (it won't reach it though)
    let key = load_encryption_key();
    let payload = encrypt(b"dummy", &key);
    store_secret(&pool, vault_id, payload).await.unwrap();

    // Grantee (not owner — so it hits blockchain check)
    let grantee = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let grantee_token = siwe_login(&base_url, &client, &grantee).await;

    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&grantee_token)
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 503, "Should return 503 when chain is unavailable");
    let body: Value = res.json().await.unwrap();
    assert!(body["error"].as_str().unwrap().contains("unavailable"));
}

// ── Test 7: Tampered ciphertext → 500 ────────────────────────────────────────

#[sqlx::test]
async fn test_tampered_ciphertext_500(pool: PgPool) {
    let (contract_client, contract_address, signer) = deploy_contract().await;
    let contract_client = Arc::new(contract_client);
    let (base_url, client) = setup_app(pool.clone(), contract_client).await;

    let owner_wallet: LocalWallet = DEPLOYER_KEY.parse::<LocalWallet>().unwrap()
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let owner_token = siwe_login(&base_url, &client, &owner_wallet).await;

    let contract_binding = VaultAccessRegistry::new(contract_address, signer.clone());
    contract_binding.create_vault("ipfs://test".into()).send().await.unwrap().await.unwrap();
    let vault_count = {
        let c = ContractClient::new(HARDHAT_RPC_URL, &format!("{:?}", contract_address)).unwrap();
        c.get_vault_count().await.unwrap()
    };
    let blockchain_vault_id = vault_count - 1;
    let vault_id = api_create_vault(&base_url, &client, &owner_token, blockchain_vault_id, "secret").await;

    // Tamper with ciphertext directly in the DB
    sqlx::query!(
        "UPDATE encrypted_secrets SET ciphertext = '\\xdeadbeef'::bytea WHERE vault_id = $1",
        vault_id
    )
    .execute(&pool)
    .await
    .unwrap();

    // Grant access to grantee so auth passes
    let grantee = LocalWallet::new(&mut rand::thread_rng())
        .with_chain_id(signer.get_chainid().await.unwrap().as_u64());
    let grantee_addr = grantee.address();
    let expires = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 120;
    contract_binding
        .grant_access(blockchain_vault_id.into(), grantee_addr, 2, expires.into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    let grantee_token = siwe_login(&base_url, &client, &grantee).await;
    let res = client
        .get(format!("{}/vaults/{}/secret", base_url, vault_id))
        .bearer_auth(&grantee_token)
        .send()
        .await
        .unwrap();

    assert_eq!(res.status().as_u16(), 500, "Tampered ciphertext must return 500");
    let body: Value = res.json().await.unwrap();
    assert_eq!(body["error"].as_str().unwrap(), "decryption failed");
    // Confirm no secret data leaks in the body
    assert!(body.get("secret").is_none(), "Secret must not appear in error response");
}
