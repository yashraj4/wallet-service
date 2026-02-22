/**
 * Global error handling middleware
 * Converts errors into consistent JSON API responses
 */

const { AppError } = require('../utils/errors');
const { query } = require('../config/db');

function errorHandler(err, req, res, _next) {
  // Log the error
  if (err instanceof AppError) {
    console.warn(`[${err.code}] ${err.message}`);
  } else {
    console.error('Unhandled error:', err);
  }

  // Handle known application errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.walletId && { walletId: err.walletId }),
        ...(err.requested && { requested: err.requested }),
        ...(err.available !== undefined && { available: err.available }),
      },
    });
  }

  // Handle PostgreSQL unique violation (e.g., duplicate idempotency key race)
  // Try to return the cached idempotent response if available
  if (err.code === '23505') {
    const idempotencyKey = req.idempotencyKey || req.body?.idempotencyKey;
    if (idempotencyKey) {
      // Attempt async lookup of cached response
      return query(
        'SELECT response, status_code FROM idempotency_store WHERE key = $1',
        [idempotencyKey]
      ).then(result => {
        if (result.rows.length > 0) {
          return res.status(200).json({
            success: true,
            data: result.rows[0].response,
            note: 'Idempotent replay - original response returned',
          });
        }
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_TRANSACTION',
            message: 'This transaction has already been processed',
          },
        });
      }).catch(() => {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_TRANSACTION',
            message: 'This transaction has already been processed',
          },
        });
      });
    }

    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_TRANSACTION',
        message: 'This transaction has already been processed',
      },
    });
  }

  // Handle PostgreSQL check constraint violation (e.g., negative balance)
  if (err.code === '23514') {
    return res.status(422).json({
      success: false,
      error: {
        code: 'CONSTRAINT_VIOLATION',
        message: 'Transaction would violate balance constraints',
      },
    });
  }

  // Handle PostgreSQL deadlock (should be rare with our ordered locking)
  if (err.code === '40P01') {
    return res.status(503).json({
      success: false,
      error: {
        code: 'DEADLOCK_DETECTED',
        message: 'Temporary conflict detected, please retry the request',
        retryable: true,
      },
    });
  }

  // Handle PostgreSQL serialization failure
  if (err.code === '40001') {
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERIALIZATION_FAILURE',
        message: 'Concurrent modification detected, please retry',
        retryable: true,
      },
    });
  }

  // Unknown error
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : err.message,
    },
  });
}

module.exports = { errorHandler };
