# ============================================================================
# Wallet Service - Dockerfile
# Multi-stage build for minimal production image
# ============================================================================

FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY src/ ./src/
COPY sql/ ./sql/
COPY scripts/ ./scripts/

# Non-root user for security
RUN addgroup -g 1001 -S appuser && \
    adduser -S appuser -u 1001
USER appuser

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/index.js"]
