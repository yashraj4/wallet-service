/**
 * Custom error classes for the wallet service
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, 404, 'NOT_FOUND');
  }
}

class InsufficientBalanceError extends AppError {
  constructor(walletId, requested, available) {
    super(
      `Insufficient balance in wallet ${walletId}: requested ${requested}, available ${available}`,
      422,
      'INSUFFICIENT_BALANCE'
    );
    this.walletId = walletId;
    this.requested = requested;
    this.available = available;
  }
}

class DuplicateTransactionError extends AppError {
  constructor(idempotencyKey) {
    super(
      `Transaction with idempotency key already processed: ${idempotencyKey}`,
      409,
      'DUPLICATE_TRANSACTION'
    );
    this.idempotencyKey = idempotencyKey;
  }
}

class ConcurrencyError extends AppError {
  constructor(message = 'Concurrent modification detected, please retry') {
    super(message, 409, 'CONCURRENCY_CONFLICT');
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  InsufficientBalanceError,
  DuplicateTransactionError,
  ConcurrencyError,
};
