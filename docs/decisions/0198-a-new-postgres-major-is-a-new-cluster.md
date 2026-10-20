# 0198. The shared cache runs PostgreSQL 18 on CloudNativePG's maintained PostGIS image, and a new major is a new cluster

- Status: Accepted
- Date: 2026-10-20
- Decider: the maintainer (TJ), 2026-10-20, choosing to recreate the cluster on 18 and refill it, over a blue/green import, a maintained 17 image, and leaving it.
- Issues and PRs: #760 (the shared cache), #763 (the test database's move to 18), #772 (its PostGIS package), #PRNUM, bluebird-helm#395
- Cited in code as: `charts/bluebird/values.yaml` in bluebird-helm, `database.cluster.imageName`
- Guide: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), The shared cache

## Context

The chart's CloudNativePG subchart built the image name from two version values, `ghcr.io/cloudnative-pg/postgis:17-3.5`. Read on 2026-10-20, that tag is a frozen legacy build: PostgreSQL 17.5 on Debian bullseye, last rebuilt in July 2025, so it has missed every 17.x security release since, and bullseye's LTS ended in August 2026. CloudNativePG's maintained PostGIS images carry a flavour and an OS in the tag (`18-3.6-standard-trixie`), and the subchart at 0.9.0 has no 18 image in the old form. Dependabot's #763 had moved the test database to Postgres 18 but left its PostGIS package at 17, which is how the gap was noticed.

The operator upgrades a major in place only between images on one OS distribution, and the running image is bullseye where every 18 image is bookworm or trixie. Nothing in the database outlives a rebuild: the places table comes from the planet fill, the overlay snapshots from their refreshes, and the counters are minutes old. No backup is configured.

## Decision

- The chart names the image outright, `database.cluster.imageName`, pinned to the image index's digest, and keeps `database.version` at 18 and 3.6 for the record. The `standard` flavour carries every extension the subchart's bootstrap creates; `system` adds nothing this chart needs.
- The test database (`backend/tests/db/Dockerfile`) runs the same major, so the `db` suites test the Postgres production runs.
- A new major is a new cluster. The cutover, in order:
  1. Release the fill that keeps its connection alive (#PRNUM), so the refill can finish.
  2. Annotate the live Cluster `cnpg.io/reconciliationLoop=disabled`, so the chart bump cannot start an in-place upgrade on the bullseye data directory.
  3. Merge the chart PR; its Kubernetes-Manifests bump syncs the new image onto the Cluster, which the operator now ignores.
  4. Delete the Cluster. Its pods, volumes and the app's connection Secret go with it, and Argo CD's self-heal recreates it from the manifest, on 18, with a new Secret.
  5. Replace the app's pods one at a time, since each read the old Secret into its environment at start. The previews' login keeps its password, which the operator re-applies from `bluebird-database-preview`.
  6. Start a fill from the CronJob and watch it swap the table in.

## Evidence

- The image, inspected 2026-10-20 at digest `6dcf2f3b`: PostgreSQL 18.6 on Debian trixie, with `postgis`, `postgis_topology`, `fuzzystrmatch`, `postgis_tiger_geocoder` and `postgis_raster` installed; the chart's render under the stable scenario carries the pinned name and the same bootstrap.
- `make test-backend-db` (55 tests) and `make test-fill` (26) pass on Postgres 18 with PostGIS 3.6.4 from PGDG, 2026-10-20.
- The first production fill, 2026-10-20: 82 minutes to the load, then `SSL SYSCALL error: EOF detected` on its first statement, the connection having sat idle through the pipeline under Istio's one-hour TCP idle timeout. The fix is step 1.

## Alternatives rejected

- **Upgrade in place.** The operator supports it only between images on one OS, and `pg_upgrade --link` across a glibc change is how text indexes go wrong.
- **Blue/green import into a second cluster.** There is nothing in the database worth carrying over, and the chart manages one cluster.
- **A maintained 17 image on trixie.** The same cutover for a major that production would then leave later.
- **Leave it.** A database missing a year of security releases.

## Consequences

The digest moves by PR, by hand, like the subchart's version. The next major is the same cutover. Between the Cluster's deletion and the fill's end, searches fall back to Overpass, which is what a deployment with no database does.
