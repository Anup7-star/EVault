use crate::encryption::EncryptedPayload;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn store_secret(
    pool: &PgPool,
    vault_id: Uuid,
    payload: EncryptedPayload,
) -> sqlx::Result<()> {
    // We expect IV to be 12 bytes exactly.
    let existing = sqlx::query!(
        "SELECT id FROM encrypted_secrets WHERE vault_id = $1",
        vault_id
    )
    .fetch_optional(pool)
    .await?;

    if let Some(row) = existing {
        sqlx::query!(
            r#"
            UPDATE encrypted_secrets
            SET ciphertext = $1, iv = $2, auth_tag = $3, updated_at = NOW()
            WHERE id = $4
            "#,
            payload.ciphertext,
            &payload.iv[..],
            payload.auth_tag,
            row.id
        )
        .execute(pool)
        .await?;
    } else {
        let new_id = Uuid::new_v4();
        sqlx::query!(
            r#"
            INSERT INTO encrypted_secrets (id, vault_id, ciphertext, iv, auth_tag, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            "#,
            new_id,
            vault_id,
            payload.ciphertext,
            &payload.iv[..],
            payload.auth_tag,
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn get_secret(pool: &PgPool, vault_id: Uuid) -> sqlx::Result<Option<EncryptedPayload>> {
    let row = sqlx::query!(
        r#"
        SELECT ciphertext, iv, auth_tag
        FROM encrypted_secrets
        WHERE vault_id = $1
        "#,
        vault_id
    )
    .fetch_optional(pool)
    .await?;

    if let Some(record) = row {
        let mut iv = [0u8; 12];
        if record.iv.len() == 12 {
            iv.copy_from_slice(&record.iv);
        } else {
            // Technically a corruption/schema mismatch, but sqlx guarantees bytea as Vec<u8>
            return Ok(None);
        }

        Ok(Some(EncryptedPayload {
            ciphertext: record.ciphertext,
            iv,
            auth_tag: record.auth_tag.expect("auth_tag is NOT NULL in DB"),
        }))
    } else {
        Ok(None)
    }
}
