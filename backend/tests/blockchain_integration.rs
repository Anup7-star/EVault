use ethers::prelude::*;
use evault_backend::blockchain::contract_client::{
    AuthzResult, ContractClient, VaultAccessRegistry,
};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

const HARDHAT_RPC_URL: &str = "http://127.0.0.1:8545";

/// To run these tests successfully, you MUST have a local Hardhat node running.
/// Open a separate terminal, navigate to the frontend project root (EVault/), and run:
///     npx hardhat node
///
/// If it is not running, these tests will fail fast with a clear message.
async fn deploy_and_get_client() -> (
    ContractClient,
    Address,
    Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
) {
    // Check if hardhat is running
    let provider = Provider::<Http>::try_from(HARDHAT_RPC_URL).unwrap();
    if provider.get_chainid().await.is_err() {
        panic!(
            "Hardhat node is not running!\n\
             Please open a separate terminal, navigate to the frontend project root (EVault/), \
             and run:\n    npx hardhat node\n"
        );
    }

    let contract_json_str = std::fs::read_to_string("abi/VaultAccessRegistry.json")
        .expect("Failed to read abi/VaultAccessRegistry.json");
    let contract_json: serde_json::Value = serde_json::from_str(&contract_json_str).unwrap();
    let abi_value = contract_json["abi"].clone();
    let abi: ethers::abi::Abi = serde_json::from_value(abi_value).unwrap();
    let bytecode_str = contract_json["bytecode"].as_str().unwrap();
    let bytecode = ethers::core::types::Bytes::from(hex::decode(&bytecode_str[2..]).unwrap());

    // Setup signer for hardhat account 0
    let private_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    let wallet: LocalWallet = private_key.parse().unwrap();
    let fresh_provider = Provider::<Http>::try_from(HARDHAT_RPC_URL).unwrap();
    let chain_id = fresh_provider.get_chainid().await.unwrap().as_u64();
    let wallet = wallet.with_chain_id(chain_id);
    let signer = Arc::new(SignerMiddleware::new(fresh_provider, wallet));

    // Deploy contract directly using ethers-rs ContractFactory
    let factory = ethers::contract::ContractFactory::new(abi, bytecode, signer.clone());
    let contract = factory
        .deploy(())
        .expect("Failed to create contract deployment tx")
        .send()
        .await
        .expect("Failed to deploy contract");

    let address = contract.address();
    let address_str = format!("{:?}", address);

    let client = ContractClient::new(HARDHAT_RPC_URL, &address_str)
        .expect("Failed to create ContractClient");

    (client, address, signer)
}

#[tokio::test]
async fn test_blockchain_contract_interaction() {
    let (client, contract_address, signer) = deploy_and_get_client().await;

    // We need to create a vault and grant access. We use the bindings with a signer.
    let contract = VaultAccessRegistry::new(contract_address, signer.clone());

    // 1. Create a vault
    let _receipt = contract
        .create_vault("TestResource".into())
        .send()
        .await
        .expect("Failed to send createVault tx")
        .await
        .expect("Failed to wait for createVault receipt")
        .unwrap();

    // Parse the VaultCreated event to get the vault ID
    // Actually, we can just get_vault_count and subtract 1 since we are the only ones testing
    let count = client.get_vault_count().await.unwrap();
    let vault_id = count - 1;

    // Generate a random wallet to grant access to
    let test_wallet = LocalWallet::new(&mut rand::thread_rng()).address();

    // 2. Grant access, expires in 30 seconds
    let expires_in_future = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 30;

    contract
        .grant_access(vault_id.into(), test_wallet, 2, expires_in_future.into())
        .send()
        .await
        .expect("Failed to send grantAccess tx")
        .await
        .expect("Failed to wait for receipt");

    // 3. Confirm get_permission returns active=true, role=2
    let (active, expiry, role) = client.get_permission(vault_id, test_wallet).await.unwrap();
    assert!(active, "Access should be active");
    assert_eq!(expiry, expires_in_future);
    assert_eq!(role, 2);

    let has_access = client.has_access(vault_id, test_wallet).await.unwrap();
    assert!(has_access);

    // 4. Grant access with an expiry a few seconds in the future, sleep past it, and confirm active=false
    let expires_soon = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 3; // Expires in 3 seconds

    contract
        .grant_access(vault_id.into(), test_wallet, 2, expires_soon.into())
        .send()
        .await
        .unwrap()
        .await
        .unwrap();

    let (active, _, _) = client.get_permission(vault_id, test_wallet).await.unwrap();
    assert!(active, "Access should be active right after grant");

    // Sleep past the expiry (plus a little buffer to ensure block timestamp crosses)
    sleep(Duration::from_secs(4)).await;

    // Send a dummy transaction to mine a block and update block.timestamp in Hardhat
    let dummy_wallet = LocalWallet::new(&mut rand::thread_rng()).address();
    let _ = signer
        .send_transaction(TransactionRequest::pay(dummy_wallet, 1), None)
        .await
        .unwrap()
        .await
        .unwrap();

    let (active_after, _, _) = client.get_permission(vault_id, test_wallet).await.unwrap();
    assert!(!active_after, "Access should be expired and inactive");
}

#[tokio::test]
async fn test_checked_authorize_chain_unavailable() {
    // Point ContractClient at an unreachable RPC URL
    let unreachable_url = "http://127.0.0.1:1";
    let fake_address = "0x0000000000000000000000000000000000000000";

    // We expect new() to succeed because Provider::<Http>::try_from doesn't block connecting immediately in ethers
    let client = ContractClient::new(unreachable_url, fake_address).unwrap();

    let dummy_wallet = LocalWallet::new(&mut rand::thread_rng()).address();

    let result = client.checked_authorize(1, dummy_wallet).await;

    match result {
        AuthzResult::ChainUnavailable => {
            // Expected success path
        }
        _ => panic!("Expected ChainUnavailable, got different result"),
    }
}
