use evault_backend::encryption::EncryptedPayload;
use evault_backend::vault::repository::{get_secret, store_secret};
use sqlx::PgPool;
use uuid::Uuid;

#[sqlx::test]
async fn test_store_and_get_secret(pool: PgPool) {
    let vault_id = Uuid::new_v4();

    // First, insert a mock vault since encrypted_secrets references vaults(id)
    sqlx::query!(
        r#"
        INSERT INTO vaults (id, blockchain_vault_id, name, owner_wallet, storage_reference, status)
        VALUES ($1, 1, 'Test Vault', '0x123', 'ipfs://QmTest', 'active')
        "#,
        vault_id
    )
    .execute(&pool)
    .await
    .unwrap();

    let payload = EncryptedPayload {
        ciphertext: vec![1, 2, 3, 4],
        iv: [5; 12],
        auth_tag: vec![6, 7, 8, 9],
    };

    // Store it
    store_secret(&pool, vault_id, payload).await.unwrap();

    // Retrieve it
    let retrieved = get_secret(&pool, vault_id).await.unwrap().unwrap();

    assert_eq!(retrieved.ciphertext, vec![1, 2, 3, 4]);
    assert_eq!(retrieved.iv, [5; 12]);
    assert_eq!(retrieved.auth_tag, vec![6, 7, 8, 9]);

    // Test upsert (store again with different data)
    let payload2 = EncryptedPayload {
        ciphertext: vec![4, 3, 2, 1],
        iv: [9; 12],
        auth_tag: vec![9, 8, 7, 6],
    };

    store_secret(&pool, vault_id, payload2).await.unwrap();

    let retrieved2 = get_secret(&pool, vault_id).await.unwrap().unwrap();
    assert_eq!(retrieved2.ciphertext, vec![4, 3, 2, 1]);
    assert_eq!(retrieved2.iv, [9; 12]);
    assert_eq!(retrieved2.auth_tag, vec![9, 8, 7, 6]);
}

#[sqlx::test]
async fn test_get_secret_not_found(pool: PgPool) {
    let vault_id = Uuid::new_v4();
    let retrieved = get_secret(&pool, vault_id).await.unwrap();
    assert!(retrieved.is_none());
}
