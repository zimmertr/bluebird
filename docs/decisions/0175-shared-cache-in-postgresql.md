# 0175. Every pod shares one PostgreSQL with PostGIS, run by CloudNativePG, and the app runs as before without it

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: option A (one PostgreSQL with PostGIS holding what the app asks upstream for over and over), CloudNativePG with its operator installed once in Kubernetes-Manifests and its `cluster` chart a bluebird-helm subchart behind values, on by default, a `proxmox-flashpool` volume, one refresher per source chosen by an advisory lock, a backoff doubling from a minute to an hour, the forecast cache kept per pod, and CI run with the database off. The three modes, the pool size, the single instance and leaving the Istio sidecar on are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760, #65 (share caches and budgets across the pods), #734, #745
- Cited in code as: #760
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/db/` bullet; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0176 (the places table), 0181 (the shared limits), 0182 (the shared snapshots), 0183 (previews read it), 0184 (the planet fill)

## Context

Production runs three to ten replicas, all leaving through one address, and each pod fetched and limited on its own. Every pod fetched the wildfire, closure and smoke snapshots, and a cold wildfire fetch measured 6.7 s and 16.5 MB (2026-07-31). The discovery and lookup caches were per pod, so a repeat question on another pod asked Overpass again. An address's real limit was the replica count times the configured one. Nominatim's 3.5 s spacing was per pod, which breaks its policy of about one request a second above three pods, and the Open-Meteo pacer's 550 a minute was per pod against Open-Meteo's 600 per address. #65 had asked to share these since 2026-07-23. On 2026-10-18 the maintainer joined it with #734 (trailheads and crags on the map) and #745 (a large ring fails whenever Overpass does) into #760, since all three asked what the app should hold itself.

## Decision

**One PostgreSQL 17 with PostGIS 3.5 is the cache every pod shares.** CloudNativePG runs it. Kubernetes-Manifests installs the operator once (chart `cloudnative-pg` 0.29.1, in `bluebird-system`), because its CRDs and webhooks are cluster-wide. bluebird-helm carries the operator's `cluster` chart 0.9.0 as a subchart aliased `database`, on by default (`database.enabled`). It runs one instance with no PodDisruptionBudget: the database is a cache the fill can rebuild, and a replica would double its disk for nothing. The pod reads `DATABASE_URL` from the `uri` key of the Secret the operator writes for the cluster (`<release>-database-app`). Production's data sits on a static FlashPool volume pre-bound to the operator's claim, so it outlives the pod.

**It holds what the app asked upstream for again and again**: the places table (0176), the wildfire, closure and smoke snapshots (0182), the counters behind the rate limits, the Nominatim gate and the Open-Meteo budgets (0181), and the place-search cache. The schema is `backend/app/db/migrations/0001_cache.sql`. A pod applies it at start under an advisory lock, each file in its own transaction. The forecast cache stays per pod: only keyed API callers use it, so sharing it would change nothing a visitor sees.

**The database is optional, and every reader keeps its per-pod path.** `app/db` has three modes. With no `DATABASE_URL` the app runs as it did before #760: discovery asks Overpass, and each pod fetches its own snapshots and keeps its own counts. Writable is the shared mode. Read-only (`DATABASE_READ_ONLY`, for previews, 0183) reads places and snapshots and keeps counters and caches per pod. A pod connects in the background, so one whose database is down still starts, serves per pod, and retries from 5 s, doubling to a minute. Every way the database can fail a request comes out as `DatabaseUnavailable`, and the caller takes its per-pod path for that request, so a database problem is never a 500.

**One pod at a time refreshes each source.** `app/db/refresh.py` runs one loop per source on every writable pod, ticking every 30 s. An advisory lock per source decides which pod does the work. The lock dies with its connection, so a crashed pod hands the source to whichever pod ticks next, with no leader to elect. `refresh_state` holds when each source is due and how often it has failed, so a failure on one pod is not retried at once by the next. The backoff doubles from 60 s to 3,600 s, jittered by a fifth either way. A source still backing off when its next interval comes round takes that interval, so no source has two attempts in flight.

**A pod's pool holds at most `DATABASE_POOL_MAX` connections, 10 by default, and the chart sets `max_connections` to 200**: ten replicas at ten each, the previews, and room.

**The operator and the database take the namespace's Istio sidecar like every other pod.** The mesh runs native sidecars, so the database's init Job still completes. The cluster has no PeerAuthentication (read 2026-10-18), so mTLS is permissive and the API server reaches the operator's webhook through the sidecar. The Kubernetes-Manifests kustomization says a STRICT PeerAuthentication would need an exception for that webhook.

## Evidence

The per-pod costs above are from #760's problem statement (2026-10-18). CloudNativePG's `cluster` chart 0.9.0 with `type: postgis` installs PostGIS from `ghcr.io/cloudnative-pg/postgis:<pg>-<postgis>`, and `17-3.5` exists for amd64 (read on 2026-10-18, not rendered). The places validation ran on PostgreSQL 18 and PostGIS 3.6 (0176); production and the test database run 17. A shared check costs about a tenth of a millisecond on a local PostgreSQL 17 (0181, 2026-10-18).

## Alternatives rejected

- **Raise the tile budget and hold trailheads and crags in memory** (#760's option B, PR #756 as it stood). Each pod still fetched everything on start, and #65 was untouched.
- **Self-host Overpass** (option C). A few hundred GB of disk and a service to keep current, for one feature.
- **A hand-built PostgreSQL.** The maintainer asked for CloudNativePG's charts and images.
- **Opt the database's pods out of the sidecar.** Nothing needed it while mTLS is permissive.

## Consequences

The cluster gains a stateful component and an operator. Argo CD syncs the operator and the volume first (wave -2), the database next (-1) and the app last (0), because the app's pods read the Secret the operator writes. `database.enabled: false` installs the app as it ran before: Overpass discovery, per-pod snapshots and counts, and no trailhead or crag markers. A database outage sends each request to its per-pod path. The `db` tests run in a CI job of their own (0184).
