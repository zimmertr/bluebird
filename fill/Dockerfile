# The planet fill (#760): builds the shared cache's places table from the
# OpenStreetMap planet file. A daily CronJob runs it; most days it finds the
# table current and exits. See fill/fill.py.
#
# Built from the repository root, because it carries the app's own
# backend/app/services/osm/rules.py rather than a copy of the rules, and
# fill/Dockerfile.dockerignore keeps that context to the few files it copies.
#
# Debian packages osmium-tool and pyosmium, so nothing here is compiled. The
# base is pinned by digest as well as tag for the reason the app's Dockerfile
# gives: the tag says which release this is, the digest which build of it.
FROM debian:trixie-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f AS runtime

LABEL org.opencontainers.image.title="Bluebird Forecast planet fill" \
      org.opencontainers.image.description="Builds Bluebird Forecast's places table from the OpenStreetMap planet file" \
      org.opencontainers.image.source="https://github.com/zimmertr/bluebird" \
      org.opencontainers.image.url="https://bluebirdforecast.com" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Unpinned (DL3008) for the reason the app floats pip: a pin sits outside
# Dependabot's view and goes stale, and trixie moves these packages only for
# security and serious bugs. The upgrade takes the security archive's fixes to
# packages the base image already holds. CI builds this image with no layer
# cache, so every release installs what Debian publishes that day.
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        osmium-tool \
        python3 \
        python3-psycopg2 \
        python3-pyosmium \
    && rm -rf /var/lib/apt/lists/*
# Nothing needs root: the fill writes only to the scratch volume and talks to
# the database and the planet mirror. A fixed numeric UID, as in the app's
# image, so Kubernetes runAsNonRoot can check it without reading /etc/passwd.
RUN useradd --system --uid 10001 --user-group --no-create-home --home-dir /nonexistent \
        --shell /usr/sbin/nologin bluebirdforecast
WORKDIR /app
# The image is published on Docker Hub, so the license travels with it.
COPY LICENSE ./LICENSE
COPY backend/app/services/osm/rules.py fill/fill.py ./
USER 10001:10001
ENTRYPOINT ["python3", "/app/fill.py"]

# The suite, kept out of what ships: pytest, the app's migrations for the
# end-to-end test's database, and services/http.py for the one identity check.
FROM runtime AS test
USER 0
# hadolint ignore=DL3008
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-pytest \
    && rm -rf /var/lib/apt/lists/*
COPY backend/app/db/migrations/ ./migrations/
COPY backend/app/services/http.py ./testdata/http.py
COPY fill/tests/ ./tests/
USER 10001:10001
ENTRYPOINT ["python3", "-m", "pytest", "-p", "no:cacheprovider", "-q", "/app/tests"]

# Last, so a build with no --target is the image that ships, not the suite.
FROM runtime AS fill
