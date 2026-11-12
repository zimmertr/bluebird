# The database the suite's `database` fixture talks to (#760): PostgreSQL 18
# with PostGIS from PGDG. The PostGIS package names the major, so it moves
# with the tag; a tag one major ahead of the package installs no PostGIS.
# Built here rather than pulled as postgis/postgis because that image has no
# arm64 build, and the suite runs on the maintainer's Mac as well as in CI.
#
# The server is installed again beside PostGIS, from the same repository, so
# the two are always one build: PGDG builds each PostGIS against its newest
# minor, and a digest pinned before that minor reached the image carries an
# older server the new library cannot load into (PostGIS 3.7.0+dfsg-1.pgdg13+2
# against 18.6 failed on `heap_datum_check`, 2026-11-12).
FROM postgres:18-trixie@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42
RUN apt-get update \
    && apt-get install -y --no-install-recommends --allow-change-held-packages \
        postgresql-18 postgresql-18-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
