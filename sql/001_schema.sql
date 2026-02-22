-- ============================================================================
-- WALLET SERVICE - DATABASE SCHEMA
-- Double-Entry Ledger Architecture for Gaming/Loyalty Platform
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. ASSET TYPES
-- Defines the types of virtual currency in the platform
-- ============================================================================
CREATE TABLE asset_types (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_types_code ON asset_types(code);

-- ============================================================================
-- 2. USERS
-- Both regular users and system accounts (treasury, revenue, etc.)
-- ============================================================================
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(100) UNIQUE NOT NULL,
    email       VARCHAR(255),
    user_type   VARCHAR(20) NOT NULL DEFAULT 'user'
                CHECK (user_type IN ('user', 'system')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_type ON users(user_type);

-- ============================================================================
-- 3. WALLETS
-- One wallet per user per asset type. System wallets allow negative balance
-- (they are the source/sink of credits). User wallets enforce non-negative.
-- ============================================================================
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset_type_id   INT NOT NULL REFERENCES asset_types(id),
    balance         BIGINT NOT NULL DEFAULT 0,
    allow_negative  BOOLEAN NOT NULL DEFAULT FALSE,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, asset_type_id)
);

-- Enforce non-negative balance for user wallets at database level
ALTER TABLE wallets ADD CONSTRAINT chk_wallet_balance
    CHECK (allow_negative = TRUE OR balance >= 0);

CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_wallets_asset ON wallets(asset_type_id);
CREATE INDEX idx_wallets_user_asset ON wallets(user_id, asset_type_id);

-- ============================================================================
-- 4. TRANSACTIONS
-- Records each business operation (top-up, bonus, purchase)
-- The idempotency_key ensures no duplicate processing
-- ============================================================================
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     VARCHAR(255) UNIQUE,
    transaction_type    VARCHAR(50) NOT NULL
                        CHECK (transaction_type IN ('TOPUP', 'BONUS', 'PURCHASE')),
    status              VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
                        CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
    source_wallet_id    UUID NOT NULL REFERENCES wallets(id),
    dest_wallet_id      UUID NOT NULL REFERENCES wallets(id),
    asset_type_id       INT NOT NULL REFERENCES asset_types(id),
    amount              BIGINT NOT NULL CHECK (amount > 0),
    description         TEXT,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX idx_transactions_source ON transactions(source_wallet_id);
CREATE INDEX idx_transactions_dest ON transactions(dest_wallet_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- ============================================================================
-- 5. LEDGER ENTRIES (Double-Entry Bookkeeping)
-- Every transaction produces exactly TWO ledger entries:
--   DEBIT  on the source wallet (balance decreases)
--   CREDIT on the destination wallet (balance increases)
-- This ensures the books always balance: sum(CREDIT) = sum(DEBIT)
-- ============================================================================
CREATE TABLE ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    entry_type      VARCHAR(10) NOT NULL
                    CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount          BIGINT NOT NULL CHECK (amount > 0),
    balance_before  BIGINT NOT NULL,
    balance_after   BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX idx_ledger_wallet_created ON ledger_entries(wallet_id, created_at DESC);

-- ============================================================================
-- 6. IDEMPOTENCY STORE
-- Caches responses for idempotent operations to return on retry
-- ============================================================================
CREATE TABLE idempotency_store (
    key         VARCHAR(255) PRIMARY KEY,
    response    JSONB NOT NULL,
    status_code INT NOT NULL DEFAULT 200,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_idempotency_expires ON idempotency_store(expires_at);

-- ============================================================================
-- 7. HELPER FUNCTION: Update wallet timestamp on balance change
-- ============================================================================
CREATE OR REPLACE FUNCTION update_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wallet_updated
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_timestamp();
