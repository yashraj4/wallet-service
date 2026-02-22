#!/bin/bash
# ============================================================================
# Wallet Service - Setup Script
# Creates the database, runs migrations, and seeds data
# ============================================================================

set -e

echo "============================================"
echo "  Wallet Service - Database Setup"
echo "============================================"

# Configuration (override with environment variables)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-wallet_service}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

export PGPASSWORD="$DB_PASSWORD"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="$SCRIPT_DIR/../sql"

echo ""
echo "📦 Configuration:"
echo "   Host:     $DB_HOST:$DB_PORT"
echo "   Database: $DB_NAME"
echo "   User:     $DB_USER"
echo ""

# Create database if it doesn't exist
echo "📋 Creating database '$DB_NAME'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "CREATE DATABASE $DB_NAME"
echo "   ✅ Database ready."
echo ""

# Run schema
echo "📋 Running schema migration..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_DIR/001_schema.sql"
echo "   ✅ Schema created."
echo ""

# Run seed data
echo "🌱 Inserting seed data..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_DIR/002_seed.sql"
echo "   ✅ Data seeded."
echo ""

# Verify
echo "🔍 Verifying setup..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT u.username, at.code, w.balance FROM wallets w JOIN users u ON w.user_id = u.id JOIN asset_types at ON w.asset_type_id = at.id WHERE u.user_type = 'user' ORDER BY u.username, at.code;"

echo ""
echo "✨ Setup complete! Start the server with: npm start"
