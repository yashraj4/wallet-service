-- ============================================================================
-- WALLET SERVICE - SEED DATA
-- Pre-populates the database with asset types, system accounts, and test users
-- ============================================================================

-- ============================================================================
-- 1. ASSET TYPES
-- ============================================================================
INSERT INTO asset_types (code, name, description) VALUES
    ('GOLD_COINS',     'Gold Coins',      'Primary in-game currency used for purchases and upgrades'),
    ('DIAMONDS',       'Diamonds',        'Premium currency earned through achievements or purchases'),
    ('LOYALTY_POINTS', 'Loyalty Points',  'Reward points earned through gameplay and daily logins');

-- ============================================================================
-- 2. SYSTEM ACCOUNTS
-- Treasury:  Source of all new credits (top-ups and bonuses flow FROM here)
-- Revenue:   Sink for spent credits (purchases flow TO here)
-- ============================================================================
INSERT INTO users (id, username, email, user_type) VALUES
    ('00000000-0000-0000-0000-000000000001', 'treasury', 'treasury@system.internal', 'system'),
    ('00000000-0000-0000-0000-000000000002', 'revenue',  'revenue@system.internal',  'system');

-- System wallets for each asset type (allow_negative = true)
-- Treasury wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 0, TRUE),
    ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 2, 0, TRUE),
    ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 3, 0, TRUE);

-- Revenue wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 1, 0, TRUE),
    ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 2, 0, TRUE),
    ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 3, 0, TRUE);

-- ============================================================================
-- 3. USER ACCOUNTS WITH INITIAL BALANCES
-- ============================================================================
INSERT INTO users (id, username, email, user_type) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'alice_gamer',   'alice@example.com',   'user'),
    ('a0000000-0000-0000-0000-000000000002', 'bob_player',    'bob@example.com',     'user'),
    ('a0000000-0000-0000-0000-000000000003', 'charlie_pro',   'charlie@example.com', 'user');

-- Alice's wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 1000, FALSE),
    ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2, 50,   FALSE),
    ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 3, 500,  FALSE);

-- Bob's wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('b1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 1, 750,  FALSE),
    ('b1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 2, 25,   FALSE),
    ('b1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 3, 300,  FALSE);

-- Charlie's wallets
INSERT INTO wallets (id, user_id, asset_type_id, balance, allow_negative) VALUES
    ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 1, 2000, FALSE),
    ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 2, 100,  FALSE),
    ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 3, 1500, FALSE);

-- ============================================================================
-- 4. SEED INITIAL LEDGER ENTRIES
-- Record the initial balances as top-ups from treasury for auditability
-- ============================================================================

-- Alice's initial Gold Coins
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'SEED_ALICE_GOLD', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, 1000, 'Initial seed: Alice Gold Coins');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'DEBIT',  1000, 0, -1000),
    ('f0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'CREDIT', 1000, 0, 1000);

-- Alice's initial Diamonds
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000002', 'SEED_ALICE_DIAMONDS', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 2, 50, 'Initial seed: Alice Diamonds');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'DEBIT',  50, 0, -50),
    ('f0000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'CREDIT', 50, 0, 50);

-- Alice's initial Loyalty Points
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000003', 'SEED_ALICE_LOYALTY', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 3, 500, 'Initial seed: Alice Loyalty Points');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'DEBIT',  500, 0, -500),
    ('f0000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000003', 'CREDIT', 500, 0, 500);

-- Bob's initial Gold Coins
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000004', 'SEED_BOB_GOLD', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, 750, 'Initial seed: Bob Gold Coins');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'DEBIT',  750, -1000, -1750),
    ('f0000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'CREDIT', 750, 0, 750);

-- Bob's initial Diamonds
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000005', 'SEED_BOB_DIAMONDS', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 2, 25, 'Initial seed: Bob Diamonds');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'DEBIT',  25, -50, -75),
    ('f0000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000002', 'CREDIT', 25, 0, 25);

-- Bob's initial Loyalty Points
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000006', 'SEED_BOB_LOYALTY', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 3, 300, 'Initial seed: Bob Loyalty Points');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', 'DEBIT',  300, -500, -800),
    ('f0000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000003', 'CREDIT', 300, 0, 300);

-- Charlie's initial Gold Coins
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000007', 'SEED_CHARLIE_GOLD', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 1, 2000, 'Initial seed: Charlie Gold Coins');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'DEBIT',  2000, -1750, -3750),
    ('f0000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000001', 'CREDIT', 2000, 0, 2000);

-- Charlie's initial Diamonds
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000008', 'SEED_CHARLIE_DIAMONDS', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 2, 100, 'Initial seed: Charlie Diamonds');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'DEBIT',  100, -75, -175),
    ('f0000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000002', 'CREDIT', 100, 0, 100);

-- Charlie's initial Loyalty Points
INSERT INTO transactions (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, asset_type_id, amount, description) VALUES
    ('f0000000-0000-0000-0000-000000000009', 'SEED_CHARLIE_LOYALTY', 'TOPUP', 'COMPLETED',
     '10000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 3, 1500, 'Initial seed: Charlie Loyalty Points');
INSERT INTO ledger_entries (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after) VALUES
    ('f0000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'DEBIT',  1500, -800, -2300),
    ('f0000000-0000-0000-0000-000000000009', 'c1000000-0000-0000-0000-000000000003', 'CREDIT', 1500, 0, 1500);

-- Update treasury balances to reflect total outflows
UPDATE wallets SET balance = -3750 WHERE id = '10000000-0000-0000-0000-000000000001'; -- Gold Coins
UPDATE wallets SET balance = -175  WHERE id = '10000000-0000-0000-0000-000000000002'; -- Diamonds
UPDATE wallets SET balance = -2300 WHERE id = '10000000-0000-0000-0000-000000000003'; -- Loyalty Points
