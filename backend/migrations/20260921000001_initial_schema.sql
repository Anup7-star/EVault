-- Migration: 20260921000001_initial_schema
-- EVault initial database schema

-- ── Users ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID          PRIMARY KEY,
    wallet_address  VARCHAR(42)   NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Vaults ─────────────────────────────────────────────────────────────────
CREATE TABLE vaults (
    id                  UUID          PRIMARY KEY,
    blockchain_vault_id BIGINT        NOT NULL UNIQUE,
    name                VARCHAR(255)  NOT NULL,
    description         TEXT,
    owner_wallet        VARCHAR(42)   NOT NULL,
    storage_reference   TEXT          NOT NULL,
    status              VARCHAR(32)   NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Permissions ────────────────────────────────────────────────────────────
CREATE TABLE permissions (
    id              UUID          PRIMARY KEY,
    vault_id        UUID          NOT NULL REFERENCES vaults(id),
    wallet_address  VARCHAR(42)   NOT NULL,
    role            VARCHAR(32)   NOT NULL,
    expires_at      TIMESTAMPTZ   NOT NULL,
    active          BOOLEAN       NOT NULL DEFAULT TRUE,
    granted_by      VARCHAR(42)   NOT NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE(vault_id, wallet_address)
);

-- ── Encrypted Secrets ──────────────────────────────────────────────────────
CREATE TABLE encrypted_secrets (
    id            UUID          PRIMARY KEY,
    vault_id      UUID          NOT NULL REFERENCES vaults(id),
    ciphertext    BYTEA         NOT NULL,
    iv            BYTEA         NOT NULL,
    auth_tag      BYTEA,
    key_reference TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Auth Nonces ────────────────────────────────────────────────────────────
CREATE TABLE auth_nonces (
    id              UUID          PRIMARY KEY,
    wallet_address  VARCHAR(42)   NOT NULL,
    nonce           VARCHAR(128)  NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ   NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Sessions ───────────────────────────────────────────────────────────────
CREATE TABLE sessions (
    id                  UUID          PRIMARY KEY,
    wallet_address      VARCHAR(42)   NOT NULL,
    session_token_hash  VARCHAR(128)  NOT NULL,
    expires_at          TIMESTAMPTZ   NOT NULL,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ
);

-- ── Audit Logs ─────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    id              UUID          PRIMARY KEY,
    wallet_address  VARCHAR(42),
    action          VARCHAR(64)   NOT NULL,
    vault_id        UUID,
    request_id      UUID,
    metadata        JSONB,
    timestamp       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX idx_permissions_wallet  ON permissions(wallet_address);
CREATE INDEX idx_permissions_vault   ON permissions(vault_id);
CREATE INDEX idx_auth_nonces_wallet  ON auth_nonces(wallet_address);
CREATE INDEX idx_sessions_wallet     ON sessions(wallet_address);
