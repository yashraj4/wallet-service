/**
 * Wallet Service - Core Business Logic
 * 
 * Implements a double-entry ledger system with:
 *   - Pessimistic locking (SELECT FOR UPDATE)
 *   - Deadlock avoidance via ordered lock acquisition
 *   - Idempotency key support
 *   - Full auditability through ledger entries
 * 
 * CONCURRENCY STRATEGY:
 * ---------------------
 * We use PostgreSQL's SELECT ... FOR UPDATE to acquire row-level exclusive locks
 * on the affected wallets BEFORE reading their balance. This ensures:
 *   1. No two transactions can modify the same wallet simultaneously
 *   2. Balance reads within the transaction are guaranteed consistent
 *   3. The CHECK constraint on wallets acts as a final safety net
 * 
 * DEADLOCK AVOIDANCE:
 * -------------------
 * When a transaction touches multiple wallets (source + destination), we ALWAYS
 * lock them in ascending UUID order. This guarantees a consistent lock ordering
 * across all transactions, making deadlocks impossible.
 * 
 * Example: If Tx1 locks wallets (A, B) and Tx2 locks wallets (B, A),
 * both will lock in order (A, B), preventing circular wait conditions.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const {
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  ConcurrencyError,
} = require('../utils/errors');

// Well-known system account IDs
const SYSTEM_ACCOUNTS = {
  TREASURY: '00000000-0000-0000-0000-000000000001',
  REVENUE:  '00000000-0000-0000-0000-000000000002',
};

/**
 * Look up a wallet by user_id + asset_type code
 */
async function findWallet(client, userId, assetCode) {
  const result = await client.query(
    `SELECT w.id, w.user_id, w.balance, w.allow_negative, w.version, w.asset_type_id, at.code as asset_code
     FROM wallets w
     JOIN asset_types at ON w.asset_type_id = at.id
     WHERE w.user_id = $1 AND at.code = $2`,
    [userId, assetCode]
  );
  
  if (result.rows.length === 0) {
    throw new NotFoundError('Wallet', `user=${userId}, asset=${assetCode}`);
  }
  
  return result.rows[0];
}

/**
 * Lock wallets in sorted order to prevent deadlocks.
 * Returns the wallet rows with updated balances.
 */
async function lockWalletsInOrder(client, walletIds) {
  // Sort UUIDs to ensure consistent lock ordering
  const sortedIds = [...walletIds].sort();
  
  const result = await client.query(
    `SELECT w.id, w.user_id, w.balance, w.allow_negative, w.version, 
            w.asset_type_id, at.code as asset_code
     FROM wallets w
     JOIN asset_types at ON w.asset_type_id = at.id
     WHERE w.id = ANY($1)
     ORDER BY w.id ASC
     FOR UPDATE`,
    [sortedIds]
  );
  
  if (result.rows.length !== walletIds.length) {
    throw new NotFoundError('Wallet', `One or more wallets not found in: ${walletIds.join(', ')}`);
  }
  
  // Return as a map for easy lookup
  const walletMap = {};
  for (const row of result.rows) {
    walletMap[row.id] = row;
  }
  return walletMap;
}

/**
 * Check and return cached idempotent response if this key was already processed
 */
async function checkIdempotencyKey(client, key) {
  if (!key) return null;
  
  const result = await client.query(
    `SELECT response, status_code FROM idempotency_store 
     WHERE key = $1 AND expires_at > NOW()`,
    [key]
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Store an idempotent response for future duplicate detection
 */
async function storeIdempotencyKey(client, key, response, statusCode = 200) {
  if (!key) return;
  
  await client.query(
    `INSERT INTO idempotency_store (key, response, status_code)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO NOTHING`,
    [key, JSON.stringify(response), statusCode]
  );
}

/**
 * Execute the core double-entry transfer between two wallets
 * This is the atomic unit of all wallet operations.
 */
async function executeTransfer(client, {
  sourceWalletId,
  destWalletId,
  amount,
  assetTypeId,
  transactionType,
  description,
  metadata,
  idempotencyKey,
}) {
  // 1. Lock both wallets in sorted order (deadlock prevention)
  const wallets = await lockWalletsInOrder(client, [sourceWalletId, destWalletId]);
  const sourceWallet = wallets[sourceWalletId];
  const destWallet = wallets[destWalletId];
  
  // 2. Validate sufficient balance (skip for system wallets that allow negative)
  if (!sourceWallet.allow_negative && sourceWallet.balance < amount) {
    throw new InsufficientBalanceError(
      sourceWalletId,
      amount,
      sourceWallet.balance
    );
  }
  
  // 3. Calculate new balances
  const sourceBalanceBefore = parseInt(sourceWallet.balance);
  const destBalanceBefore = parseInt(destWallet.balance);
  const sourceBalanceAfter = sourceBalanceBefore - amount;
  const destBalanceAfter = destBalanceBefore + amount;
  
  // 4. Update source wallet (debit)
  await client.query(
    `UPDATE wallets 
     SET balance = $1, version = version + 1
     WHERE id = $2`,
    [sourceBalanceAfter, sourceWalletId]
  );
  
  // 5. Update destination wallet (credit)
  await client.query(
    `UPDATE wallets 
     SET balance = $1, version = version + 1
     WHERE id = $2`,
    [destBalanceAfter, destWalletId]
  );
  
  // 6. Create transaction record
  const txnId = uuidv4();
  await client.query(
    `INSERT INTO transactions 
     (id, idempotency_key, transaction_type, status, source_wallet_id, dest_wallet_id, 
      asset_type_id, amount, description, metadata)
     VALUES ($1, $2, $3, 'COMPLETED', $4, $5, $6, $7, $8, $9)`,
    [txnId, idempotencyKey, transactionType, sourceWalletId, destWalletId,
     assetTypeId, amount, description, JSON.stringify(metadata || {})]
  );
  
  // 7. Create ledger entries (double-entry)
  // DEBIT entry on source wallet
  await client.query(
    `INSERT INTO ledger_entries 
     (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after)
     VALUES ($1, $2, 'DEBIT', $3, $4, $5)`,
    [txnId, sourceWalletId, amount, sourceBalanceBefore, sourceBalanceAfter]
  );
  
  // CREDIT entry on destination wallet
  await client.query(
    `INSERT INTO ledger_entries 
     (transaction_id, wallet_id, entry_type, amount, balance_before, balance_after)
     VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
    [txnId, destWalletId, amount, destBalanceBefore, destBalanceAfter]
  );
  
  return {
    transactionId: txnId,
    transactionType,
    sourceWallet: {
      id: sourceWalletId,
      balanceBefore: sourceBalanceBefore,
      balanceAfter: sourceBalanceAfter,
    },
    destWallet: {
      id: destWalletId,
      balanceBefore: destBalanceBefore,
      balanceAfter: destBalanceAfter,
    },
    amount,
    description,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// PUBLIC API METHODS
// ============================================================================

/**
 * FLOW 1: Wallet Top-up (Purchase)
 * User purchases credits using real money.
 * Direction: Treasury → User Wallet
 * 
 * @param {string} userId - The user receiving credits
 * @param {string} assetCode - Asset type code (e.g., 'GOLD_COINS')
 * @param {number} amount - Amount of credits to add (positive integer)
 * @param {string} [idempotencyKey] - Unique key to prevent duplicate processing
 * @param {string} [description] - Human-readable description
 * @param {object} [metadata] - Additional context (e.g., payment reference)
 */
async function topUp(userId, assetCode, amount, idempotencyKey, description, metadata) {
  // Input validation
  if (!userId) throw new ValidationError('userId is required');
  if (!assetCode) throw new ValidationError('assetCode is required');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive integer');
  }
  
  return db.withTransaction(async (client) => {
    // Check idempotency
    const cached = await checkIdempotencyKey(client, idempotencyKey);
    if (cached) return { ...cached.response, idempotent: true };
    
    // Find the user's wallet and treasury wallet for this asset
    const userWallet = await findWallet(client, userId, assetCode);
    const treasuryWallet = await findWallet(client, SYSTEM_ACCOUNTS.TREASURY, assetCode);
    
    const result = await executeTransfer(client, {
      sourceWalletId: treasuryWallet.id,
      destWalletId: userWallet.id,
      amount,
      assetTypeId: userWallet.asset_type_id,
      transactionType: 'TOPUP',
      description: description || `Top-up of ${amount} ${assetCode}`,
      metadata: { ...metadata, paymentFlow: 'topup' },
      idempotencyKey,
    });
    
    // Store idempotent response
    await storeIdempotencyKey(client, idempotencyKey, result);
    
    return result;
  });
}

/**
 * FLOW 2: Bonus / Incentive
 * System issues free credits to a user (referral bonus, daily reward, etc.)
 * Direction: Treasury → User Wallet
 * 
 * @param {string} userId - The user receiving the bonus
 * @param {string} assetCode - Asset type code
 * @param {number} amount - Amount of bonus credits
 * @param {string} [idempotencyKey] - Unique key
 * @param {string} [description] - Reason for the bonus
 * @param {object} [metadata] - Additional context (e.g., bonus type, campaign)
 */
async function issueBonus(userId, assetCode, amount, idempotencyKey, description, metadata) {
  if (!userId) throw new ValidationError('userId is required');
  if (!assetCode) throw new ValidationError('assetCode is required');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive integer');
  }
  
  return db.withTransaction(async (client) => {
    const cached = await checkIdempotencyKey(client, idempotencyKey);
    if (cached) return { ...cached.response, idempotent: true };
    
    const userWallet = await findWallet(client, userId, assetCode);
    const treasuryWallet = await findWallet(client, SYSTEM_ACCOUNTS.TREASURY, assetCode);
    
    const result = await executeTransfer(client, {
      sourceWalletId: treasuryWallet.id,
      destWalletId: userWallet.id,
      amount,
      assetTypeId: userWallet.asset_type_id,
      transactionType: 'BONUS',
      description: description || `Bonus of ${amount} ${assetCode}`,
      metadata: { ...metadata, paymentFlow: 'bonus' },
      idempotencyKey,
    });
    
    await storeIdempotencyKey(client, idempotencyKey, result);
    return result;
  });
}

/**
 * FLOW 3: Purchase / Spend
 * User spends credits to buy a service/item within the app.
 * Direction: User Wallet → Revenue Account
 * 
 * @param {string} userId - The user spending credits
 * @param {string} assetCode - Asset type code
 * @param {number} amount - Amount to spend
 * @param {string} [idempotencyKey] - Unique key
 * @param {string} [description] - What was purchased
 * @param {object} [metadata] - Additional context (e.g., item ID, order ref)
 */
async function purchase(userId, assetCode, amount, idempotencyKey, description, metadata) {
  if (!userId) throw new ValidationError('userId is required');
  if (!assetCode) throw new ValidationError('assetCode is required');
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError('amount must be a positive integer');
  }
  
  return db.withTransaction(async (client) => {
    const cached = await checkIdempotencyKey(client, idempotencyKey);
    if (cached) return { ...cached.response, idempotent: true };
    
    const userWallet = await findWallet(client, userId, assetCode);
    const revenueWallet = await findWallet(client, SYSTEM_ACCOUNTS.REVENUE, assetCode);
    
    const result = await executeTransfer(client, {
      sourceWalletId: userWallet.id,
      destWalletId: revenueWallet.id,
      amount,
      assetTypeId: userWallet.asset_type_id,
      transactionType: 'PURCHASE',
      description: description || `Purchase of ${amount} ${assetCode}`,
      metadata: { ...metadata, paymentFlow: 'purchase' },
      idempotencyKey,
    });
    
    await storeIdempotencyKey(client, idempotencyKey, result);
    return result;
  });
}

/**
 * Get the current balance for a user across all asset types,
 * or for a specific asset type.
 */
async function getBalance(userId, assetCode) {
  if (!userId) throw new ValidationError('userId is required');
  
  let queryText = `
    SELECT w.id as wallet_id, at.code as asset_code, at.name as asset_name,
           w.balance, w.updated_at
    FROM wallets w
    JOIN asset_types at ON w.asset_type_id = at.id
    WHERE w.user_id = $1
  `;
  const params = [userId];
  
  if (assetCode) {
    queryText += ' AND at.code = $2';
    params.push(assetCode);
  }
  
  queryText += ' ORDER BY at.code';
  
  const result = await db.query(queryText, params);
  
  if (result.rows.length === 0) {
    throw new NotFoundError('Wallet', userId);
  }
  
  return result.rows.map(row => ({
    walletId: row.wallet_id,
    assetCode: row.asset_code,
    assetName: row.asset_name,
    balance: parseInt(row.balance),
    updatedAt: row.updated_at,
  }));
}

/**
 * Get transaction history for a user's wallet
 */
async function getTransactions(userId, assetCode, { limit = 20, offset = 0 } = {}) {
  if (!userId) throw new ValidationError('userId is required');
  
  let queryText = `
    SELECT t.id, t.transaction_type, t.status, t.amount, t.description, 
           t.metadata, t.created_at, t.idempotency_key,
           at.code as asset_code, at.name as asset_name,
           le.entry_type, le.balance_before, le.balance_after
    FROM transactions t
    JOIN asset_types at ON t.asset_type_id = at.id
    JOIN ledger_entries le ON le.transaction_id = t.id
    JOIN wallets w ON le.wallet_id = w.id
    WHERE w.user_id = $1
  `;
  const params = [userId];
  let paramIdx = 2;
  
  if (assetCode) {
    queryText += ` AND at.code = $${paramIdx}`;
    params.push(assetCode);
    paramIdx++;
  }
  
  queryText += ` ORDER BY t.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
  params.push(limit, offset);
  
  const result = await db.query(queryText, params);
  
  return result.rows.map(row => ({
    transactionId: row.id,
    type: row.transaction_type,
    status: row.status,
    entryType: row.entry_type,
    amount: parseInt(row.amount),
    assetCode: row.asset_code,
    assetName: row.asset_name,
    balanceBefore: parseInt(row.balance_before),
    balanceAfter: parseInt(row.balance_after),
    description: row.description,
    metadata: row.metadata,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  }));
}

/**
 * Get all asset types
 */
async function getAssetTypes() {
  const result = await db.query(
    'SELECT id, code, name, description, is_active FROM asset_types WHERE is_active = TRUE ORDER BY id'
  );
  return result.rows;
}

/**
 * Get all users (non-system)
 */
async function getUsers() {
  const result = await db.query(
    `SELECT u.id, u.username, u.email, u.user_type, u.created_at
     FROM users u
     WHERE u.is_active = TRUE
     ORDER BY u.created_at`
  );
  return result.rows;
}

module.exports = {
  topUp,
  issueBonus,
  purchase,
  getBalance,
  getTransactions,
  getAssetTypes,
  getUsers,
  SYSTEM_ACCOUNTS,
};
