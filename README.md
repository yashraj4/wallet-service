# Wallet Service

A high-performance, production-grade wallet service built for gaming platforms and loyalty reward systems. Manages virtual currency balances with **ACID-compliant double-entry ledger** architecture, ensuring every credit is accounted for, even under heavy concurrent load.

---

## Table of Contents

- [Architecture Overview](#-architecture-overview)
- [Tech Stack & Rationale](#-tech-stack--rationale)
- [Quick Start](#-quick-start)
  - [Docker Compose (Recommended)](#option-1-docker-compose-recommended)
  - [Manual Setup](#option-2-manual-setup)
- [API Reference](#-api-reference)
- [Concurrency Strategy](#-concurrency-strategy)
- [Idempotency](#-idempotency)
- [Double-Entry Ledger](#-double-entry-ledger)
- [Deadlock Avoidance](#-deadlock-avoidance)
- [Running Tests](#-running-tests)
- [Project Structure](#-project-structure)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
│         (Game Server / Mobile App / Admin Panel)             │
└─────────────────┬───────────────────────────────────────────┘
                  │  REST API + Idempotency-Key Header
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                             │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  │
│  │  Helmet   │  │  CORS    │  │ Rate Limit │  │  Morgan  │  │
│  │ Security  │  │          │  │            │  │ Logging  │  │
│  └──────────┘  └──────────┘  └────────────┘  └──────────┘  │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                WALLET SERVICE                        │    │
│  │  • Idempotency Check (cached responses)             │    │
│  │  • Ordered Lock Acquisition (deadlock prevention)    │    │
│  │  • SELECT FOR UPDATE (pessimistic locking)          │    │
│  │  • Double-Entry Ledger (DEBIT + CREDIT)             │    │
│  │  • Balance Validation (non-negative constraint)     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────┬───────────────────────────────────────────┘
                  │  Single ACID Transaction
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    POSTGRESQL 16                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ wallets   │  │ transactions │  │   ledger_entries      │  │
│  │ (balance) │  │ (business)   │  │   (double-entry)      │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
│  ┌──────────────────┐  ┌─────────────────────────────────┐  │
│  │ idempotency_store│  │ CHECK(balance >= 0) constraint  │  │
│  └──────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Transaction Flows

| Flow | Direction | Description |
|------|-----------|-------------|
| **Top-up** | Treasury → User | User purchases credits with real money |
| **Bonus** | Treasury → User | System issues free credits (referral, daily reward) |
| **Purchase** | User → Revenue | User spends credits on in-app item |

---

## Tech Stack & Rationale

| Component | Choice |
|-----------|--------|
| **Runtime** | Node.js 20 
| **Framework** | Express 4 
| **Database** | PostgreSQL 16 
| **DB Driver** | node-postgres (pg) 
| **Container** | Docker + Compose 

**Why not an ORM?** 
ORMs abstract away the precise control needed for correct financial transactions. Raw SQL with parameterized queries gives us explicit control over locking, transaction boundaries, and query optimization.

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Clone and start everything
git clone <repo-url> && cd wallet-service
docker-compose up -d

# The database is automatically seeded on first start!
# API is available at http://localhost:3000
```

Verify it's running:
```bash
curl http://localhost:3000/health
```

### Option 2: Manual Setup

**Prerequisites:** Node.js 20+, PostgreSQL 16+

```bash
# 1. Install dependencies
npm install

# 2. Configure database connection
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 3. Create database and seed data
npm run seed

# 4. Start the server
npm start
```

### Seed Data Summary

After setup, the database contains:

| Asset Type | Code | Description |
|-----------|------|-------------|
| Gold Coins | `GOLD_COINS` | Primary in-game currency |
| Diamonds | `DIAMONDS` | Premium currency |
| Loyalty Points | `LOYALTY_POINTS` | Reward points |

| User | Type | Gold Coins | Diamonds | Loyalty Points |
|------|------|------------|----------|---------------|
| `treasury` | System | (negative, unlimited source) | — | — |
| `revenue` | System | 0 | 0 | 0 |
| `alice_gamer` | User | 1,000 | 50 | 500 |
| `bob_player` | User | 750 | 25 | 300 |
| `charlie_pro` | User | 2,000 | 100 | 1,500 |

---

## 📡 API Reference

### Base URL: `http://localhost:3000/api`

### 1. Top-up Wallet

```bash
POST /api/wallets/topup

# Body:
{
  "userId": "a0000000-0000-0000-0000-000000000001",
  "assetCode": "GOLD_COINS",
  "amount": 500,
  "description": "Purchased 500 Gold Coins",
  "metadata": { "paymentRef": "PAY-12345" }
}

# Headers (recommended):
Idempotency-Key: unique-uuid-here
```

### 2. Issue Bonus

```bash
POST /api/wallets/bonus

{
  "userId": "a0000000-0000-0000-0000-000000000001",
  "assetCode": "GOLD_COINS",
  "amount": 100,
  "description": "Referral bonus",
  "metadata": { "bonusType": "referral", "referredBy": "bob" }
}
```

### 3. Purchase / Spend

```bash
POST /api/wallets/purchase

{
  "userId": "a0000000-0000-0000-0000-000000000001",
  "assetCode": "GOLD_COINS",
  "amount": 200,
  "description": "Bought Legendary Sword",
  "metadata": { "itemId": "SWORD-001" }
}
```

### 4. Check Balance

```bash
GET /api/wallets/:userId/balance
GET /api/wallets/:userId/balance?assetCode=GOLD_COINS
```

### 5. Transaction History

```bash
GET /api/wallets/:userId/transactions
GET /api/wallets/:userId/transactions?assetCode=GOLD_COINS&limit=10&offset=0
```

### 6. List Assets & Users

```bash
GET /api/assets
GET /api/users
```

### Example Response (Top-up)

```json
{
  "success": true,
  "data": {
    "transactionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "transactionType": "TOPUP",
    "sourceWallet": {
      "id": "10000000-0000-0000-0000-000000000001",
      "balanceBefore": -3750,
      "balanceAfter": -4250
    },
    "destWallet": {
      "id": "a1000000-0000-0000-0000-000000000001",
      "balanceBefore": 1000,
      "balanceAfter": 1500
    },
    "amount": 500,
    "description": "Purchased 500 Gold Coins",
    "timestamp": "2026-02-22T17:30:00.000Z"
  }
}
```

---

## Concurrency Strategy

### The Problem

In a high-traffic gaming platform, many transactions can hit the same wallet simultaneously:
- A user earns rewards from multiple game rounds at once
- A user clicks "Buy" rapidly
- A bonus script credits thousands of users at the same time

Without proper concurrency control, two concurrent reads could see the same balance, both approve a spend, and result in a negative balance (a **lost update** / **race condition**).

### Our Solution: Pessimistic Locking with `SELECT FOR UPDATE`

```sql
-- Inside a transaction, this locks the wallet rows exclusively
SELECT * FROM wallets WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE;
```

**How it works:**

1. **BEGIN** a PostgreSQL transaction
2. **SELECT FOR UPDATE** on the wallet rows — this acquires an exclusive row-level lock
3. Any other transaction trying to lock the same rows **blocks** until we commit/rollback
4. Read the current balance (guaranteed accurate because we hold the lock)
5. Validate constraints (sufficient balance, etc.)
6. Update balances, insert ledger entries
7. **COMMIT** — releases all locks atomically

This ensures **serialized access** to each wallet, even under extreme concurrency. PostgreSQL's MVCC ensures readers are never blocked — only writers wait for each other.

### Defense in Depth

Even if application-level validation has a bug, the database provides a **safety net**:

```sql
-- Database-level constraint prevents negative user balances
CONSTRAINT chk_wallet_balance CHECK (allow_negative = TRUE OR balance >= 0)
```

---

## Idempotency

### The Problem

Network failures, client retries, and load balancer timeouts can cause the same request to be sent multiple times. Without idempotency, a user could be charged twice.

### Our Solution

1. Client sends a unique `Idempotency-Key` header (or in body)
2. **Within the same DB transaction**, we check if this key was already processed
3. If yes → return the cached response (no re-execution)
4. If no → execute the transaction and store the response
5. Keys expire after 24 hours

```bash
# First call: creates the transaction (201 Created)
curl -X POST /api/wallets/topup \
  -H "Idempotency-Key: abc-123" \
  -d '{"userId": "...", "assetCode": "GOLD_COINS", "amount": 100}'

# Second call with same key: returns cached response (200 OK)
curl -X POST /api/wallets/topup \
  -H "Idempotency-Key: abc-123" \
  -d '{"userId": "...", "assetCode": "GOLD_COINS", "amount": 100}'
# Response includes: "note": "Idempotent replay - original response returned"
```

**Key design detail:** The idempotency check and transaction execution happen in the **same database transaction**. This prevents a race condition where two concurrent requests with the same key could both pass the check.

---

## Double-Entry Ledger

Every transaction creates exactly **two ledger entries**:

| Entry | Wallet | Effect |
|-------|--------|--------|
| **DEBIT** | Source wallet | Balance decreases |
| **CREDIT** | Destination wallet | Balance increases |

### Why Double-Entry?

1. **Auditability**: Every credit has a corresponding debit. You can always trace where credits came from and went.
2. **Reconciliation**: `SUM(all CREDITS) = SUM(all DEBITS)` must always hold. If it doesn't, something is broken.
3. **Balance verification**: A wallet's balance can be independently computed: `initial_balance + SUM(credits) - SUM(debits)`.
4. **Regulatory compliance**: Even for virtual currencies, double-entry provides the accounting rigor expected.

### Ledger Entry Example

For a top-up of 500 Gold Coins to Alice:

```
Transaction: f47ac10b-58cc-4372-a567-0e02b2c3d479
Type: TOPUP

┌──────────────────────────────────────────────────────────────┐
│ Ledger Entry #1 (DEBIT)                                      │
│   Wallet: Treasury Gold Coins                                │
│   Amount: 500                                                │
│   Balance Before: -3750 → Balance After: -4250               │
├──────────────────────────────────────────────────────────────┤
│ Ledger Entry #2 (CREDIT)                                     │
│   Wallet: Alice Gold Coins                                   │
│   Amount: 500                                                │
│   Balance Before: 1000 → Balance After: 1500                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Deadlock Avoidance

### The Problem

When Transaction A locks Wallet 1 then Wallet 2, and Transaction B locks Wallet 2 then Wallet 1, a **circular wait** (deadlock) occurs. PostgreSQL detects this and kills one transaction, but it's wasteful.

### Our Solution: Ordered Lock Acquisition

**All transactions lock wallets in ascending UUID order**, regardless of which is source/destination:

```javascript
async function lockWalletsInOrder(client, walletIds) {
  const sortedIds = [...walletIds].sort(); // ← The key line
  
  return client.query(
    `SELECT * FROM wallets WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE`,
    [sortedIds]
  );
}
```

Since every transaction acquires locks in the **same global order**, circular waits are impossible. This is a well-known technique from database systems theory (2PL with lock ordering).

---

## Running Tests

### Load & Concurrency Test

```bash
# Start the server first
npm start

# In another terminal
npm run test:load
```

The load test verifies:
1. **Concurrent top-ups**: 50 simultaneous requests to the same wallet
2. **Idempotency**: Same key sent 10 times, only 1 transaction created
3. **Insufficient balance**: Spending more than available is rejected
4. **Concurrent spends**: Race condition test — balance never goes negative

---

## Project Structure

```
wallet-service/
├── src/
│   ├── index.js                  # Express app entry point
│   ├── config/
│   │   └── db.js                 # PostgreSQL connection pool + transaction helper
│   ├── services/
│   │   └── walletService.js      # Core business logic (the heart of the system)
│   ├── routes/
│   │   └── wallet.js             # REST API route handlers
│   ├── middleware/
│   │   ├── idempotency.js        # Idempotency key extraction
│   │   └── errorHandler.js       # Global error handling
│   └── utils/
│       └── errors.js             # Custom error classes
├── sql/
│   ├── 001_schema.sql            # Database schema (tables, indexes, constraints)
│   └── 002_seed.sql              # Seed data (assets, users, initial balances)
├── scripts/
│   ├── seed.js                   # Node.js database setup script
│   └── setup.sh                  # Bash setup script (alternative)
├── tests/
│   └── load-test.js              # Concurrency and integration tests
├── seed.sql                      # Combined schema + seed (standalone)
├── Dockerfile                    # Production container image
├── docker-compose.yml            # Full stack orchestration
├── package.json
├── .env.example
└── README.md
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **BIGINT for balances** | Avoids floating-point precision issues. All amounts are integers (smallest unit). |
| **System wallets with `allow_negative`** | Treasury can go negative because it's the unlimited source of all credits in the system. |
| **`version` column on wallets** | Supports optimistic concurrency as a secondary safeguard, enabling future API patterns like conditional updates. |
| **Separate schema + seed SQL files** | Clean separation of concerns. Schema can be versioned independently of test data. |
| **No ORM** | Direct SQL provides the precise control needed for correct financial transaction handling, including explicit lock acquisition and transaction boundaries. |
| **24-hour idempotency TTL** | Balances storage cost with practical retry windows. Most retries happen within seconds. |
| **`CHECK` constraint as safety net** | Even if application logic has a bug, the database prevents negative user balances. Defense in depth. |

---

