# The database the suite's `database` fixture talks to (#760): PostgreSQL 17,
# the major production's CloudNativePG image runs, with PostGIS from PGDG.
# Built here rather than pulled as postgis/postgis because that image has no
# arm64 build, and the suite runs on the maintainer's Mac as well as in CI.
FROM postgres:17-trixie@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
