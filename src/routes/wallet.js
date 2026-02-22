/**
 * Wallet API Routes
 * 
 * Endpoints:
 *   POST /api/wallets/topup       - Top up a user's wallet (simulates real money purchase)
 *   POST /api/wallets/bonus       - Issue bonus/incentive credits
 *   POST /api/wallets/purchase    - Spend credits on an in-app item
 *   GET  /api/wallets/:userId/balance       - Get wallet balance(s)
 *   GET  /api/wallets/:userId/transactions  - Get transaction history
 *   GET  /api/assets              - List available asset types
 *   GET  /api/users               - List all users
 */

const express = require('express');
const walletService = require('../services/walletService');
const { idempotencyMiddleware } = require('../middleware/idempotency');

const router = express.Router();

// Apply idempotency middleware to all mutation endpoints
router.use(idempotencyMiddleware);

// ============================================================================
// TRANSACTION ENDPOINTS
// ============================================================================

/**
 * POST /api/wallets/topup
 * Top up a user's wallet with purchased credits
 * 
 * Body: {
 *   userId: string (UUID),
 *   assetCode: string ('GOLD_COINS' | 'DIAMONDS' | 'LOYALTY_POINTS'),
 *   amount: number (positive integer),
 *   description?: string,
 *   metadata?: object (e.g., { paymentRef: 'PAY-123' })
 * }
 * Headers: Idempotency-Key (recommended)
 */
router.post('/wallets/topup', async (req, res, next) => {
  try {
    const { userId, assetCode, amount, description, metadata } = req.body;
    
    const result = await walletService.topUp(
      userId,
      assetCode,
      amount,
      req.idempotencyKey,
      description,
      metadata
    );
    
    const statusCode = result.idempotent ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result,
      ...(result.idempotent && { note: 'Idempotent replay - original response returned' }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/wallets/bonus
 * Issue free bonus/incentive credits to a user
 * 
 * Body: {
 *   userId: string (UUID),
 *   assetCode: string,
 *   amount: number (positive integer),
 *   description?: string,
 *   metadata?: object (e.g., { bonusType: 'referral', campaignId: 'CAMP-001' })
 * }
 */
router.post('/wallets/bonus', async (req, res, next) => {
  try {
    const { userId, assetCode, amount, description, metadata } = req.body;
    
    const result = await walletService.issueBonus(
      userId,
      assetCode,
      amount,
      req.idempotencyKey,
      description,
      metadata
    );
    
    const statusCode = result.idempotent ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result,
      ...(result.idempotent && { note: 'Idempotent replay - original response returned' }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/wallets/purchase
 * Spend credits on an in-app item or service
 * 
 * Body: {
 *   userId: string (UUID),
 *   assetCode: string,
 *   amount: number (positive integer),
 *   description?: string,
 *   metadata?: object (e.g., { itemId: 'SWORD-001', orderId: 'ORD-789' })
 * }
 */
router.post('/wallets/purchase', async (req, res, next) => {
  try {
    const { userId, assetCode, amount, description, metadata } = req.body;
    
    const result = await walletService.purchase(
      userId,
      assetCode,
      amount,
      req.idempotencyKey,
      description,
      metadata
    );
    
    const statusCode = result.idempotent ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      data: result,
      ...(result.idempotent && { note: 'Idempotent replay - original response returned' }),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// QUERY ENDPOINTS
// ============================================================================

/**
 * GET /api/wallets/:userId/balance
 * Get user's current balance across all asset types
 * Query params: ?assetCode=GOLD_COINS (optional, filter by asset)
 */
router.get('/wallets/:userId/balance', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { assetCode } = req.query;
    
    const balances = await walletService.getBalance(userId, assetCode);
    
    res.json({
      success: true,
      data: {
        userId,
        balances,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/wallets/:userId/transactions
 * Get transaction history for a user
 * Query params:
 *   ?assetCode=GOLD_COINS (optional)
 *   ?limit=20 (optional, default 20, max 100)
 *   ?offset=0 (optional, for pagination)
 */
router.get('/wallets/:userId/transactions', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { assetCode } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const transactions = await walletService.getTransactions(
      userId,
      assetCode,
      { limit, offset }
    );
    
    res.json({
      success: true,
      data: {
        userId,
        transactions,
        pagination: { limit, offset, count: transactions.length },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assets
 * List all available asset types
 */
router.get('/assets', async (req, res, next) => {
  try {
    const assets = await walletService.getAssetTypes();
    res.json({ success: true, data: assets });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users
 * List all registered users
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await walletService.getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
