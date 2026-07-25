# Stage 1: Build React frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Cache mount keeps npm's download cache out of the layer but warm across
# builds, so a lockfile change re-downloads only what actually changed.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend serving built frontend as static files
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Bluebird" \
      org.opencontainers.image.description="Map-based weather window finder for hikers and mountaineers" \
      org.opencontainers.image.source="https://github.com/zimmertr/bluebird" \
      org.opencontainers.image.url="https://bluebirdforecast.com" \
      org.opencontainers.image.licenses="GPL-3.0-only"

# Unbuffered so logs reach the container runtime immediately; no .pyc writes
# because the app dir is root-owned and read-only to the runtime user anyway.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY backend/requirements.txt ./
# hadolint ignore=DL3042
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
COPY backend/app/ ./app/
COPY --from=frontend-builder /app/frontend/dist/ ./static/
# Nothing needs root at runtime — uvicorn binds 8000 and the app only reads
# baked-in files — so serve as an unprivileged user. Fixed numeric UID/GID so
# Kubernetes runAsNonRoot can verify without resolving names inside the image.
RUN groupadd -r -g 10001 bluebird && useradd -r -u 10001 -g bluebird bluebird
USER 10001:10001
EXPOSE 8000
# Kubernetes ignores HEALTHCHECK (its probes hit /healthz directly); this is
# for plain docker/compose users. Stdlib only — slim ships no curl/wget.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
