# 0077. An overlay snapshot is served through failed refreshes for 24 hours, and no longer

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #580
- Issues and PRs: #580, #203, #388, #552
- Cited in code as: #580
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snapshot.py` bullet

## Context

The wildfire, smoke and closure overlays answer from one national snapshot that the pod holds (`SnapshotCache` in `app/services/snapshot.py`). The cache is stale-tolerant on purpose: when a refresh fails it keeps serving the last good snapshot, because a perimeter mapped an hour ago still answers a ten-mile proximity question (#203). Nothing bounded that. An upstream that stayed down kept the map showing a snapshot of any age, the browser does not read `fetched_at`, and no metric counted the failed refreshes. The readiness review found it (#580, item 2).

## Decision

`get()` serves a held snapshot for at most `MAX_STALE_S`, 24 hours after it landed. Past that it behaves as a cache that never filled: it refreshes in front of the caller, and if the refresh fails (or the failure backoff is still running) it raises the error the refresh failed with, so the route answers its existing 503 and the browser shows its existing unavailable state. One constant for all three feeds, and no env knob. Every failed refresh also increments `bluebird_forecast_snapshot_refresh_failures_total{provider}`.

The snow depth grid uses the same cache class but reads it through `current_or_schedule`, which does not apply the limit. That answer carries the grid's own analysis date onto the screen, so an old grid is a dated answer rather than a hidden one.

## Evidence

No measurement: this is a product choice about how old a picture may be. A day covers an upstream's ordinary bad night (NIFC's shared ArcGIS quota, a NOAA file server that has not published yet) without anyone noticing, and a perimeter or a closure order older than a day describes a different day.

## Alternatives rejected

- A limit per feed (shorter for fires, longer for closures, which change a few times a week). More numbers to keep, for a difference no reader would see.
- An env knob. It would need a paired `bluebird-helm` `extraEnv` change, for a value nobody has asked to tune.
- Showing the snapshot's age on the map. It needs new on-screen copy, and an overlay that fails stays quiet by the round 3 review's verdict, which #580 left settled.

## Consequences

`test_snapshot_cache.py` holds the limit: served one second before it, the held error one second after it, a refresh in front of the caller when nothing has failed, and the backoff respected past it. The overlays go blank after a day of failed refreshes, where before they showed the last copy indefinitely.
