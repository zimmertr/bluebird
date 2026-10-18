# 0172. Discovery reads trailheads and crags from the landmarks set, and asks Overpass only while a kind is still loading

- Status: Accepted
- Date: 2026-10-17
- Decider: the maintainer (TJ), 2026-10-17: the joint recommendation of the #734 and #745 sessions, and one PR and one issue for all three pieces
- Issues and PRs: #760, which replaced #734 and #745, and PR #756
- Cited in code as: #745
- Guide: root `CLAUDE.md`, Architecture step 2; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `services/landmarks.py`, `services/candidates.py` and `routes/destinations.py` bullets; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass; [`docs/API.md`](../API.md), Discovery without forecasts; [`docs/TRAFFIC.md`](../TRAFFIC.md), the Overpass row
- Related: 0171 (the set this reads), 0170 and 0118 (peaks and lakes from the tiles), 0164 (a search keeps what needed no map server), 0011 (one union discovery query), 0103 (one discovery per address)

## Context

0171 gave the pod every named trailhead and crag in OpenStreetMap, held for the map's markers. A polygon search still asked Overpass for the same two kinds on every run, through the mirror chain that fails most attempts on a busy evening. After 0170, a ring up to 1,024 tiles reads its peaks and lakes from the basemap, so those two kinds were the only reason such a ring asked Overpass at all, and the only kinds an outage cost it.

Both sessions measured the alternative of holding peaks and lakes as well, on 2026-10-17: 239,148 named lakes worldwide, whose count alone took Overpass 174 s, and a peak count that did not finish in 200 s, with every later query answered "server at capacity". The tiles already answer those kinds in about a second.

## Decision

**`discover()` answers every kind the loader has landed from the set.** `LandmarkLoader.discover_held` cuts the held features to the ring's bounding box, keeps those inside the ring by the ray cast `wfigs_coverage._in_ring`, and builds rows in `query_osm`'s shape with its identity rule, one row per kind and name. A caller cannot tell which source answered. The kinds left over, peaks and lakes always and a snapshot kind that has not landed, go to `query_osm` as before.

**Per kind, not all or nothing.** The loader lands trailheads a minute or more before crags, so each is used as soon as it lands.

**No Overpass slot for a search the set answers whole.** `POST /api/destinations` already takes the per-address slot only around what asks Overpass (0103). `LOADER.live_kinds` now tells it whether discovery will. The analyze routes keep taking the slot unconditionally; they are API-only and their slot also covers the custom list's lookup.

**Peaks and lakes stay on the tiles.** The set holds only what the tiles do not carry. A third such kind would join it; peaks and lakes would not.

## Consequences

A ring up to 1,024 tiles asks Overpass for nothing once a pod's set has loaded, and an outage no longer reaches it. A ring over the budget asks Overpass for its peaks and lakes alone. In the first few minutes after a pod starts, trailheads and crags still come from the live query, and 0164's warn line still covers that query failing.

A search's trailheads and crags can now trail an OpenStreetMap edit by up to a day, the set's refresh interval, where the live query was current. That matches the weekly tiles behind peaks and lakes.

The Overpass mirror chain is now exercised by searches only for rings over the tile budget, the first minutes after a pod starts, and the pasted-coordinate lookup. A regression in the chain will therefore show up later and more rarely than it used to, and its counters will move less on a normal evening. Read a quiet `bluebird_forecast_overpass_requests_total` with that in mind.
