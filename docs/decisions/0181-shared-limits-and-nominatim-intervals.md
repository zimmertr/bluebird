# 0181. The per-address buckets, the Nominatim gate and the Open-Meteo budgets count in the shared cache, and Nominatim is spaced 1.2 s across pods and 10 s on a pod's own

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: shared counters, so the per-address limits and the Nominatim gate are exact; a shared place-search cache; and Nominatim at "1.2 s shared", with 10 s for a pod that falls back to its own gate. The 0.5 s bound, the 30 s pause and the sweep's numbers are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760, #65, #571 (the Nominatim gate and its cache), #595 (the review behind 0103), #180 (the weighted pacer)
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/ratelimit/`, `app/routes/geocode.py` and `app/services/cache.py` bullets; [`docs/TRAFFIC.md`](../TRAFFIC.md), App-layer limits; [`docs/LIMITS.md`](../LIMITS.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0175 (the shared cache), 0103 (the geocode bucket fits inside the gate), 0002 (capacity in weighted calls), 0183 (a preview counts on its own)

## Context

Each pod counted for itself. An address's real limit was the replica count times the configured one (`docs/TRAFFIC.md`), and the Open-Meteo pacer's 550 a minute was per pod against Open-Meteo's 600 per address. Nominatim's gate spaced searches 3.5 s apart per pod: about 0.86 a second from the cluster's one address at three pods and 2.86 at ten, past Nominatim's policy of about one a second. The autoscaler runs up to ten replicas. #65 had asked for exact limits since 2026-07-23.

## Decision

**While the database is writable, the per-address buckets (`rate_buckets`), the Nominatim gate (`gates`) and the Open-Meteo weighted budgets (`weight_bookings`) count in it**, so each is one limit for the whole deployment. A bucket takes its token in one statement whose conflict holds the row's lock, so two pods cannot both spend the last one. The gate books the next free slot the same way. A budget books under an advisory lock per budget, on the database's clock, and the same pure `earliest_start` picks the start on either path, so a shared booking and a pod's own cannot disagree. A caller sleeps only after its booking commits, holding nothing.

**Everywhere else they count per pod as before**: with no database, on a read-only preview (0183), and for any call the database fails. A call that takes more than 0.5 s (`TIMEOUT_S`) or fails in any way falls back, and pauses the shared path for every guard on that pod for 30 s (`PAUSE_S`). An outage then costs one request per pod up to half a second every 30 s, where without the pause every limited request would pay it. The discovery slot and the in-flight caps stay per pod.

**Nominatim is spaced 1.2 s across pods (`NOMINATIM_MIN_INTERVAL_MS`) and 10 s on a pod's own gate (`NOMINATIM_POD_MIN_INTERVAL_MS`).** Shared, 1.2 s is 50 searches a minute from the one address whatever the replica count, with room for two searches that land closer together than they were booked, since each opens a fresh connection after its wait. A pod on its own gate has to leave room for every replica, and 10 s at ten replicas is the same one a second.

**The place-search cache is shared too** (`geocode_cache`, ten minutes), since a repeat search is as likely to land on another pod.

**A sweep every 9 minutes deletes a bucket idle for 45 minutes**, bookings out of their window, and expired searches (`ratelimit/shared.py`, the `counters` refresh source). The numbers are the privacy page's: a searched place name is gone within 20 minutes, and an address's count within an hour of its last request. `legal.test.ts` adds the lifetime, one sweep and a late tick, and holds each sum under the page's words.

## Evidence

Measured 2026-10-18 on a local PostgreSQL 17 in Docker, 2,000 calls each:

| Operation | p50 | p95 |
|---|---|---|
| Bucket check | 0.095 ms | 0.120 ms |
| Bucket check, refused | 0.097 ms | 0.123 ms |
| Gate booking | 0.093 ms | 0.117 ms |
| Place-search cache hit | 0.090 ms | 0.109 ms |
| Budget booking, 20 live bookings | 0.368 ms | 0.433 ms |
| Budget booking, 2,000 live bookings | 1.40 ms | 2.51 ms |

The per-pod check takes about 0 ms. The run wrote 2,002 bucket rows and no local bucket, so the checks reached the database.

Shared at 3.5 s, the gate would have served 17 searches a minute for the whole cluster against 51 from three pods on their own, and one address's first minute (10 a minute plus a burst of 3, the geocode bucket that day) would have taken 13 of the 17. At 1.2 s, `test_the_geocode_bucket_books_the_gate_no_faster_than_it_serves` still passes, so 0103's rule holds.

## Alternatives rejected

- **3.5 s shared.** A third of what three pods served, for every visitor.
- **1.0 s shared.** Nominatim's limit with no margin.
- **One interval for both modes.** A pod on its own needs at least the replica count in seconds and the shared gate needs about one, so one number fails one mode.
- **No pause after a failure.** During an outage every limited request would wait up to half a second before counting on its own pod.

## Consequences

With the database up, an address gets the published limit and not that times the replica count, and the cluster stays under Nominatim's policy at ten pods. Every limited request pays one round trip to the database, about a tenth of a millisecond. An outage puts the guards back on per-pod counts within a request, with the old replica-count ceiling until it ends. The counter tables are unlogged: a database crash empties them, which loosens the limits for about a minute. The privacy page says the counts are in the server's database, deleted within an hour, where it said they were in memory and gone at a restart.
