# Stage 1: Build React frontend.
#
# --platform=$BUILDPLATFORM pins this stage to the machine doing the building
# rather than to each target architecture. Its output is a directory of static
# JS/CSS, which is the same bytes whatever CPU produced it, so building it per
# architecture buys nothing and costs everything: in the multi-arch release
# build the arm64 half runs under QEMU, where `npm run build` measured 35.6 s
# against 3.0 s native (release run 34916818009, 2026-09-15) and was the
# longest step of the whole release. The amd64-only PR and preview builds are
# unaffected, since there BUILDPLATFORM and TARGETPLATFORM are the same.
#
# Both base images are pinned by digest as well as tag: the tag says which
# runtime this is (test_node_version.py reads the Node major off it), and the
# digest says which build of it, so a rebuild cannot pull a different image
# than the one last reviewed. Dependabot moves both, and opens a PR when the
# image under an unchanged tag is rebuilt.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Cache mount keeps npm's download cache out of the layer but warm across
# builds, so a lockfile change re-downloads only what actually changed.
# --ignore-scripts because no package here needs its install script on Linux
# (#633): the lockfile's two are fsevents, macOS only, and @scarf/scarf, which
# only reports the install to scarf.sh. esbuild and the other native tools ship
# their binaries as optional dependencies, so the build needs no script either.
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend serving built frontend as static files.
# Alpine over slim: Debian's base layer ships dozens of no-fix CVEs (perl-base,
# libc6, …) that scanners flag forever; musl's ~10-package base scans clean.
FROM python:3.15-alpine@sha256:2699b90f4d562a22e2dd076c82f964032f64814204bff36d271a54ba4cc2c7e2

LABEL org.opencontainers.image.title="Bluebird Forecast" \
      org.opencontainers.image.description="Map-based weather window finder for hikers and mountaineers" \
      org.opencontainers.image.source="https://github.com/zimmertr/bluebird" \
      org.opencontainers.image.url="https://bluebirdforecast.com" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

# Unbuffered so logs reach the container runtime immediately; no .pyc writes
# because the app dir is root-owned and read-only to the runtime user anyway.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
# requirements.txt is pip-compile's lock of requirements.in: every installed
# distribution, the indirect ones included, pinned with its hashes (#633).
# --require-hashes makes a package missing from it, or a download that does not
# match it, fail the build rather than install, so the image holds exactly the
# set the PR's tests ran and the dependency graph lists.
COPY backend/requirements.txt ./
# Upgrade pip first: the version bundled with the base image trails pip's own
# security fixes (e.g. CVE-2025-8869 tar link-following), and scanners flag it.
# Deliberately unpinned (DL3013): a pin here would sit outside Dependabot's
# view and go stale; floating rides each rebuild to the current fix.
# hadolint ignore=DL3042,DL3013
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --require-hashes -r requirements.txt
COPY backend/app/ ./app/
COPY --from=frontend-builder /app/frontend/dist/ ./static/
# Swagger UI's assets, vendored so /docs renders without reaching out to a CDN.
# Taken straight from the builder's node_modules rather than through a Vite
# plugin: frontend/package.json is "type": "module", so a plugin doing this in
# CommonJS would break, and routing 1 MB of vendor JS through Vite's hashing
# buys nothing.
#
# The bundle's first line points at swagger-ui-bundle.js.LICENSE.txt beside it,
# and Swagger UI's Apache-2.0 asks that its LICENSE and NOTICE travel with a
# copy, so all three ship next to the two files that use them (#571). The
# frontend build lists these files too (VENDORED_FILES in
# frontend/plugins/thirdPartyLicenses.ts), and a test holds that list to this
# COPY.
COPY --from=frontend-builder \
  /app/frontend/node_modules/swagger-ui-dist/swagger-ui-bundle.js \
  /app/frontend/node_modules/swagger-ui-dist/swagger-ui.css \
  /app/frontend/node_modules/swagger-ui-dist/swagger-ui-bundle.js.LICENSE.txt \
  /app/frontend/node_modules/swagger-ui-dist/LICENSE \
  /app/frontend/node_modules/swagger-ui-dist/NOTICE \
  ./static/swagger-ui/
# The license this image is offered under, beside the code it covers. The
# image is published on Docker Hub, so a copy of it is a copy of the software.
COPY LICENSE ./LICENSE
# The Python half of the notice file the frontend build began: one block per
# installed distribution, read from what pip actually installed. It follows
# the dist COPY because it appends to the file that COPY brings in, and it runs
# from a bind mount so the script is not left in the image. A distribution
# with no license text fails the build here.
RUN --mount=type=bind,source=backend/scripts/write_third_party_licenses.py,target=/tmp/write_third_party_licenses.py \
    python /tmp/write_third_party_licenses.py static/third-party-licenses.txt
# Nothing needs root at runtime — uvicorn binds 8000 and the app only reads
# baked-in files — so serve as an unprivileged user. Fixed numeric UID/GID so
# Kubernetes runAsNonRoot can verify without resolving names inside the image.
RUN addgroup -S -g 10001 bluebirdforecast && adduser -S -u 10001 -G bluebirdforecast bluebirdforecast
# Build identity for GET /api/version and the OpenAPI info.version, populated by
# release.yml and pr-preview.yml. Deliberately below every COPY and pip layer:
# APP_BUILT_AT changes on every build, so declaring it any earlier would
# invalidate the pip-install and COPY layers on every single build. The one
# RUN under it is the apk upgrade, which wants exactly that.
ARG APP_VERSION=dev
ARG APP_COMMIT=dev
ARG APP_BUILT_AT=dev
ENV APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT} \
    APP_BUILT_AT=${APP_BUILT_AT}
# Alpine fixes a package days to weeks before the python base image rebuilds
# carrying it, so the base tag can ship a package Alpine 3.24 has already
# fixed. That gap has no Dependabot remedy: Dependabot moves the base when the
# image is rebuilt, and twice now the newest image was already pinned while the
# packages under it were not (7 fixable HIGH util-linux CVEs, 2026-09; zlib
# CVE-2026-85091, 2026-10). Upgrading beats pinning the one package, for the
# reason the pip upgrade above is written on: a pin sits outside Dependabot's
# view and goes stale.
#
# It sits after the build ARGs on purpose. BuildKit keys a RUN on every ARG in
# scope, used or not, and APP_COMMIT and APP_BUILT_AT change on every build, so
# this layer is rebuilt every time against Alpine's current index. Above
# pip's layers it was keyed on the base digest alone and served a snapshot
# between base moves: v0.105.0 shipped zlib 1.3.2-r0 while Alpine's index had
# 1.3.2-r1 and the base was the newest published (code scanning alert 39,
# 2026-10-14), and the remedy was a hand-cleared cache. Nothing below this line
# builds anything, so the rebuild costs one apk index fetch and repeats none of
# pip's or the frontend's work.
RUN apk upgrade --no-cache
USER 10001:10001
# 8000 is the app; 9464 is the Prometheus metrics server (see app/telemetry.py
# for why it is a separate port). EXPOSE is documentation — neither is
# published unless the runtime maps it.
EXPOSE 8000 9464
# Kubernetes ignores HEALTHCHECK (its probes hit /healthz directly); this is
# for plain docker/compose users. Python stdlib rather than busybox wget so the
# check doesn't depend on which base-image flavor is underneath.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
