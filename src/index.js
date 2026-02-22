/**
 * Wallet Service - Application Entry Point
 * 
 * High-performance wallet service for gaming/loyalty platforms.
 * Features: double-entry ledger, idempotency, deadlock prevention.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const walletRoutes = require('./routes/wallet');
const { errorHandler } = require('./middleware/errorHandler');
const { healthCheck } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Request logging
app.use(morgan('short'));

// Body parsing
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});
app.use('/api/', limiter);

// ============================================================================
// ROUTES
// ============================================================================

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await healthCheck();
  const status = dbHealth.healthy ? 200 : 503;
  
  res.status(status).json({
    service: 'wallet-service',
    version: '1.0.0',
    status: dbHealth.healthy ? 'healthy' : 'degraded',
    database: dbHealth,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api', walletRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Global error handler
app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                   WALLET SERVICE v1.0                      ║
║                                                            ║
║  🚀 Server running on port ${PORT}                          ║
║  📊 Health check: http://localhost:${PORT}/health             ║
║  📖 API base:     http://localhost:${PORT}/api                ║
║                                                            ║
║  Endpoints:                                                ║
║    POST /api/wallets/topup       - Top up wallet           ║
║    POST /api/wallets/bonus       - Issue bonus credits     ║
║    POST /api/wallets/purchase    - Spend credits           ║
║    GET  /api/wallets/:id/balance - Check balance           ║
║    GET  /api/wallets/:id/transactions - History            ║
║    GET  /api/assets              - List asset types        ║
║    GET  /api/users               - List users              ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
