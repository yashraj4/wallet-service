-- ============================================================================
-- WALLET SERVICE - COMBINED SCHEMA + SEED
-- Run this single file to set up everything from scratch
-- Usage: psql -U postgres -d wallet_service -f seed.sql
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS asset_types (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    VARCHAR(100) UNIQUE NOT NULL,
    email       VARCHAR(255),
    user_type   VARCHAR(20) NOT NULL DEFAULT 'user'
                CHECK (user_type IN ('user', 'system')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    asset_type_id   INT NOT NULL REFERENCES asset_types(id),
    balance         BIGINT NOT NULL DEFAULT 0,
    allow_negative  BOOLEAN NOT NULL DEFAULT FALSE,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, asset_type_id),
    CONSTRAINT chk_wallet_balance CHECK (allow_negative = TRUE OR balance >= 0)
);

CREATE TABLE IF NOT EXISTS transactions (
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

CREATE TABLE IF NOT EXISTS ledger_entries (
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

CREATE TABLE IF NOT EXISTS idempotency_store (
    key         VARCHAR(255) PRIMARY KEY,
    response    JSONB NOT NULL,
    status_code INT NOT NULL DEFAULT 200,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asset_types_code ON asset_types(code);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_asset ON wallets(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user_asset ON wallets(user_id, asset_type_id);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dest ON transactions(dest_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON ledger_entries(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_store(expires_at);

-- Trigger
CREATE OR REPLACE FUNCTION update_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_updated ON wallets;
CREATE TRIGGER trg_wallet_updated
    BEFORE UPDATE ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_timestamp();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Asset Types
INSERT INTO asset_types (code, name, description) VALUES
    ('GOLD_COINS',     'Gold Coins',      'Primary in-game currency used for purchases and upgrades'),
    ('DIAMONDS',       'Diamonds',        'Premium currency earned through achievements or purchases'),
    ('LOYALTY_POINTS', 'Loyalty Points',  'Reward points earned through gameplay and daily logins')
ON CONFLICT (code) DO NOTHING;

-- System Accounts
INSERT INTO users (id, username, email, user_type) VALUES
    ('00000000-0000-0000-0000-000000000001', 'treasury', 'treasury@system.internal', 'system'),
    ('00000000-0000-0000-0000-000000000002', 'revenue',  'revenue@system.internal',  'system')
ON CONFLICT (id) DO NOTHING;

-- User Accounts
INSERT INTO users (id, username, email, user_type) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'alice_gamer',   'alice@example.com',   'user'),
    ('a0000000-0000-0000-0000-000000000002', 'bob_player',    'bob@example.com',     'user'),
    ('a0000000-0000-0000-0000-000000000003', 'charlie_pro',   'charlie@example.com', 'user')
ON CONFLICT (id) DO NOTHING;

-- Treasury Wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, -3750, TRUE),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2, -175,  TRUE),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 3, -2300, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Revenue Wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1, 0, TRUE),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 2, 0, TRUE),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 3, 0, TRUE)
ON CONFLICT (id) DO NOTHING;

-- User Wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 1000, FALSE),
    ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2, 50,   FALSE),
    ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 3, 500,  FALSE),
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 1, 750,  FALSE),
    ('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 2, 25,   FALSE),
    ('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 3, 300,  FALSE),
    ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 1, 2000, FALSE),
    ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 2, 100,  FALSE),
    ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 3, 1500, FALSE)
ON CONFLICT (id) DO NOTHING;
