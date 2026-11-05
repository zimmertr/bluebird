# The database the suite's `database` fixture talks to (#760): PostgreSQL 18
# with PostGIS from PGDG. The PostGIS package names the major, so it moves
# with the tag; a tag one major ahead of the package installs no PostGIS.
# Built here rather than pulled as postgis/postgis because that image has no
# arm64 build, and the suite runs on the maintainer's Mac as well as in CI.
FROM postgres:18-trixie@sha256:3a4264520e121176619f54ff867d12774bc81e95e7b84db58d63bccdb6144b81
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-18-postgis-3 \
    && rm -rf /var/lib/apt/lists/*
