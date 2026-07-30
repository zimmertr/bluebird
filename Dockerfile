# Stage 1: Build React frontend
FROM node:26-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Cache mount keeps npm's download cache out of the layer but warm across
# builds, so a lockfile change re-downloads only what actually changed.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend serving built frontend as static files.
# Alpine over slim: Debian's base layer ships dozens of no-fix CVEs (perl-base,
# libc6, …) that scanners flag forever; musl's ~10-package base scans clean.
FROM python:3.14-alpine

LABEL org.opencontainers.image.title="Bluebird" \
      org.opencontainers.image.description="Map-based weather window finder for hikers and mountaineers" \
      org.opencontainers.image.source="https://github.com/zimmertr/bluebird" \
      org.opencontainers.image.url="https://bluebirdforecast.com" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

# Unbuffered so logs reach the container runtime immediately; no .pyc writes
# because the app dir is root-owned and read-only to the runtime user anyway.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
COPY backend/requirements.txt ./
# pip is build-time only here, which is what the upgrade and the uninstall each
# follow from. Upgrading guards the extraction pip is about to do, since the
# bundled version trails pip's own fixes (e.g. CVE-2025-8869 tar link-following);
# unpinned despite DL3013 so a rebuild takes the current pip rather than a pin
# nothing watches. Uninstalling keeps pip out of the image's scanned inventory:
# it publishes an SBOM of the libraries it vendors, so a shipped pip reports
# their CVEs as ours, against copies no dependency bump here can reach.
# hadolint ignore=DL3042,DL3013
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt && \
    pip uninstall -y pip
COPY backend/app/ ./app/
COPY --from=frontend-builder /app/frontend/dist/ ./static/
# Swagger UI's assets, vendored so /docs renders without reaching out to a CDN.
# Taken straight from the builder's node_modules rather than through a Vite
# plugin: frontend/package.json is "type": "module", so a plugin doing this in
# CommonJS would break, and routing 1 MB of vendor JS through Vite's hashing
# buys nothing.
COPY --from=frontend-builder \
  /app/frontend/node_modules/swagger-ui-dist/swagger-ui-bundle.js \
  /app/frontend/node_modules/swagger-ui-dist/swagger-ui.css \
  ./static/swagger-ui/
# Nothing needs root at runtime — uvicorn binds 8000 and the app only reads
# baked-in files — so serve as an unprivileged user. Fixed numeric UID/GID so
# Kubernetes runAsNonRoot can verify without resolving names inside the image.
RUN addgroup -S -g 10001 bluebird && adduser -S -u 10001 -G bluebird bluebird
# Build identity for GET /api/version and the OpenAPI info.version, populated by
# release.yml and pr-preview.yml. Deliberately the LAST thing before USER:
# APP_BUILT_AT changes on every build, so declaring it any earlier would
# invalidate the pip-install and COPY layers on every single build.
ARG APP_VERSION=dev
ARG APP_COMMIT=dev
ARG APP_BUILT_AT=dev
ENV APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT} \
    APP_BUILT_AT=${APP_BUILT_AT}
USER 10001:10001
EXPOSE 8000
# Kubernetes ignores HEALTHCHECK (its probes hit /healthz directly); this is
# for plain docker/compose users. Python stdlib rather than busybox wget so the
# check doesn't depend on which base-image flavor is underneath.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
