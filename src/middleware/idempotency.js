/**
 * Idempotency Middleware
 * 
 * Extracts the Idempotency-Key header from incoming requests and attaches
 * it to the request object for downstream use in the wallet service.
 * 
 * Clients should send a unique UUID in the Idempotency-Key header for
 * any state-mutating request. If the same key is sent again, the original
 * response is returned without re-executing the transaction.
 */

function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
  
  if (idempotencyKey) {
    // Validate format (should be a reasonable string)
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length > 255) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Idempotency-Key must be a string with max 255 characters',
        },
      });
    }
    req.idempotencyKey = idempotencyKey;
  }
  
  next();
}

module.exports = { idempotencyMiddleware };
