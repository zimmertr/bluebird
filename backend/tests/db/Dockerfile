# The database the suite's `database` fixture talks to (#760): PostgreSQL 17,
# the major production's CloudNativePG image runs, with PostGIS from PGDG.
# Built here rather than pulled as postgis/postgis because that image has no
# arm64 build, and the suite runs on the maintainer's Mac as well as in CI.
FROM postgres:18-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
