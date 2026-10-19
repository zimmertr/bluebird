# 0182. One pod at a time refreshes each overlay snapshot into the shared cache, every pod serves it from there, and 0077's 24 hours runs on the database's clock

- Status: Accepted. Keeps 0077.
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: the wildfire, closure and smoke snapshots in the database on their own schedules, one refresher per source across all pods, and 0077's 24 hours kept. The poll period, the deadlines, the row format and reading the age off the database's clock are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760, #65, #203 (the wildfire snapshot), #580 (0077), #388, #552
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snapshot.py`, `nifc.py`, `usfs_closures.py` and `hms.py` bullets; [`docs/TRAFFIC.md`](../TRAFFIC.md); [`docs/API.md`](../API.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0007 (one national wildfire snapshot, filtered per request, which still holds), 0077 (served for 24 hours through failed refreshes), 0175 (the shared cache and its refresh loop)

## Context

The wildfire (`nifc.py`), closure (`usfs_closures.py`) and smoke (`hms.py`) overlays each answer from one snapshot a pod holds and filters per request (0007). Every pod fetched its own. A cold wildfire fetch measured 6.7 s and 16.5 MB (2026-07-31), against an ArcGIS quota NIFC's organization shares, so ten pods spent it ten times.

## Decision

**Each overlay is a refresh source** (0175), run on its interval whatever the replica count: wildfires every 10 minutes, closures and smoke every 30, the existing `WILDFIRE_CACHE_TTL_S`, `CLOSURE_CACHE_TTL_S` and `SMOKE_CACHE_TTL_S`. The pod that holds the source's lock fetches the upstream and writes the snapshot to `snapshots` (`SnapshotCache.publish`) as gzipped JSON in an envelope with a format number. A refresh has 120 s (`SHARED_REFRESH_DEADLINE_S`): NIFC's own request timeout, and a fifth of the shortest interval. A failure takes the shared backoff, and its message, already worded as the 503's sentence, goes to `refresh_state` for every pod to answer with.

**Readers never call the upstream while the database answers.** A pod reads the row at most once every 30 s (`SHARED_POLL_S`, one refresh tick), and fetches the body only when its `fetched_at` has moved, so an unchanged snapshot stays the same object and is gzipped once per pod. Read-only previews read it too.

**A snapshot's age is measured on the database's clock** (`now() - fetched_at`), so a pod that reads a 23-hour-old row serves it for one more hour. 0077's limit is unchanged: past 24 hours, or before the first row lands, the route answers its existing 503 with the refreshing pod's reason. The pod does not fetch for itself then, because ten pods asking the upstream at once is what the shared cache exists to stop.

**A pod fetches for itself only when the cache cannot answer**: no database, a read that fails or runs past 30 s (`SHARED_READ_DEADLINE_S`), or a row in a format this release cannot read, as a canary of the next release may have written. A reader that falls back waits for the read and then its own 60 s refresh, inside Cloudflare's 100 s. The per-pod `*_RETRY_AFTER_FAILURE_S` knobs apply only on that path.

## Evidence

The per-pod cost above (0007, 2026-07-31). The slowest cold fetch measured, 6.7 s, is about an eighteenth of the refresh deadline. `tests/test_snapshot_shared.py` holds the rest against a real database (2026-10-18): a refresh writes the row for all three overlays and another reader loads it, a preview reads it, an unchanged row is not decoded again, a row past 24 hours answers 503 with the writer's reason, no row answers 503 without calling the upstream, and a database that cannot answer, or a row in another format, falls back to the upstream.

## Alternatives rejected

- **Each pod fetching for itself when the row is missing or too old.** Ten fetches against a shared quota, at the moment the upstream is struggling.
- **Age from when this pod read the row.** A pod that read a 23-hour-old row would serve it for another day.

## Consequences

With the database up, NIFC, NOAA and the Forest Service see one fetch per interval from the deployment whatever the replica count. The overlays refresh whether or not anyone is looking, where a pod used to refresh only when a request found its copy stale. A new deployment, or a new database, answers the overlays' 503 until the first refresh lands, about one tick plus the fetch. A new snapshot reaches every pod within about two ticks. Each route's `fetched_at` now means when the deployment last fetched, and its description says so.
