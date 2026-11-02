# ==============================================================================
# RepoDojo Express API Control Plane Dockerfile (OCI ARM64 / amd64 Multi-Arch)
# ==============================================================================

# Stage 1: Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for deterministic pnpm version
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy shared types and API source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared package and API server
RUN pnpm --filter @repodojo/shared build && pnpm --filter @repodojo/api build

# Prune non-production dependencies
RUN pnpm --filter @repodojo/api --prod deploy /app/deploy

# Stage 2: Production runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install dumb-init for graceful signal forwarding (SIGTERM / SIGINT) and curl for healthchecks
RUN apk add --no-cache dumb-init curl

# Security: Run as unprivileged node user (Decision 12.1)
USER node

ENV NODE_ENV=production
ENV PORT=5000

# Copy pruned production deployment from builder
COPY --chown=node:node --from=builder /app/deploy ./
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist

EXPOSE 5000

# 3-Stage Probe Healthcheck (Decision 13.2)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/livez || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
