# BestMe Backend
FROM python:3.11-slim

# Python behaves better in containers with these: no .pyc files, and
# unbuffered output so logs appear in `docker logs` immediately.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Build-only dependencies; removed in the same layer to keep the image small.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copied first so `pip install` is cached until requirements actually change.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user: a container breakout should not land on root.
RUN useradd --create-home --shell /bin/bash bestme \
    && chown -R bestme:bestme /app
USER bestme

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

# Gunicorn supervises uvicorn workers: it restarts a worker that dies,
# which `uvicorn` alone does not do. PORT is honoured because most cloud
# platforms (Railway, Render, Fly) assign it at runtime.
#
# Development uses docker-compose, which overrides this command with
# `--reload`; --reload must never run in production (it spawns a file
# watcher and disables the worker model).
CMD ["sh", "-c", "gunicorn app.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers ${WEB_CONCURRENCY:-2} \
    --bind 0.0.0.0:${PORT:-8000} \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -"]
