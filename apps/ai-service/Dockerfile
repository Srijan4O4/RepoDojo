# ==============================================================================
# RepoDojo AI Orchestration & Graphify Service Dockerfile (OCI ARM64 / amd64)
# ==============================================================================

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies first for layer caching
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy source code and sync project
COPY . ./
RUN uv sync --frozen --no-dev

# Stage 2: Production runtime
FROM python:3.12-slim-bookworm AS runner

WORKDIR /app

# Install curl for healthcheck probe
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Run as unprivileged appuser (Decision 12.1)
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Copy virtual environment and code from builder
COPY --chown=appuser:appuser --from=builder /app/.venv /app/.venv
COPY --chown=appuser:appuser . /app

USER appuser

EXPOSE 8000

# Healthcheck probe (Decision 13.2)
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/livez || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
