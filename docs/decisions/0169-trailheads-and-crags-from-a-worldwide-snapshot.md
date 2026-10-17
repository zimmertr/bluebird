# 0169. The map's trailheads and crags come from a worldwide snapshot the pod fills at startup

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #734, 2026-10-16: option A worldwide, `ofm-climbing` dropped and routes kept off the map, both kinds from zoom 11, the signboard icon, always on, and the loader's shape (sequential kinds, infinite retries, exponential backoff, every step logged)
- Issues and PRs: #734, #732 (climbing labels clickable from the tiles), #715 and PR #731 (the crag type), #119 (clickable peaks and lakes), #203 (the wildfire snapshot this copies the route from), #735 (the Overpass outage)
- Cited in code as: #734
- Guide: root `CLAUDE.md`, Architecture step 2; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `services/landmarks.py`, `routes/landmarks.py`, `services/snapshot.py` and `services/osm/` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `landmarks.ts`, `basemap.ts`, `features.ts` and `poiPopup.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `landmarks.ts`, `basemapPoi.ts` and `poiPopup.ts` bullets; [`docs/USAGE.md`](../USAGE.md), Click a destination; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass, and Map tiles; [`docs/API.md`](../API.md), Trailheads and crags; [`docs/TRAFFIC.md`](../TRAFFIC.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0157 (places and climbing labels selectable, whose climbing half this supersedes), 0159 (the crag type, whose icon this keeps and whose tile-label placement this supersedes), 0118 (the ring's peaks and lakes from the tiles), 0077 (the snapshot age limit, which this loader does not share), 0011 (one union discovery query, whose clauses this reuses)

## Context

After #732 the map's climbing labels came from the basemap's `poi` layer, which drops OSM's `climbing=` tag, so a crag, a boulder and a single route were all added as `Climbing` with an OpenStreetMap link, and a crag mapped as a relation was not there to click (Index, 14/2659/5707: 3 of 12 crags and 0 of 4 areas). No tile carries a trailhead at all (Lake 22 and Mailbox Peak checked on 2026-10-15, Mount Si in #732). PR #731 had just made crags a polygon destination type with a Mountain Project link, found by `_CLAUSES` and typed by `_classify`.

## Decision

- **The pod holds every named trailhead and crag in OpenStreetMap, worldwide**, in `services/landmarks.py`, fetched through the mirror chain with `build_world_query`, the discovery clauses with no polygon and `out tags center`, and typed by the same `_classify`. `GET /api/landmarks?bbox=` serves the set by bounding box as GeoJSON points carrying `name`, `kind`, `osm_id` and `elevation_ft`, in the wildfire route's shape: `parse_bbox`, a raw `Response` of held feature text, a gzipped whole-world answer held per snapshot, `fetched_at` as a foreign member, and its own rate bucket, published as `landmarks_per_minute` and `landmarks_burst`.
- **The set fills at startup, one kind at a time, in the order a reader misses them: trailheads, then crags.** A kind that fails is retried forever on a doubling backoff from a minute to an hour, with an info line per fetch and a warn line per failure naming the backoff. A kind that has landed is served while the next loads, and the whole set is refreshed once a day (`LANDMARKS_REFRESH_S`). It is served however old it is: a trailhead does not move, so 0077's age limit does not apply. The route answers the overlays' `503` with `Retry-After` until the first kind lands. Not a `SnapshotCache`, because each kind runs minutes past that class's one-minute refresh deadline and no visitor should wait on it.
- **The attempt timeout is 300 s** (`ATTEMPT_TIMEOUT_S`), handed to the chain as `attempt_timeout_s` with the metric path `snapshot`, where the mirror table gives a polygon 25 s.
- **The map draws both kinds from zoom 11** (`LANDMARK_MINZOOM`), the trails' floor, as symbol layers of their own on a GeoJSON source (`map/landmarks.ts`) refetched for the viewport on a settled pan, always on, with no Layers row. A trailhead wears a drawn signboard (`TRAILHEAD_IMAGE`) and a crag the climber from 0159; crag icons collide away as the climbing labels did. Both layer ids are in `POI_LAYERS`, so a click opens the same card a peak does and the Map group's glow lights them.
- **A clicked marker takes the exact point the layer fetched, not the drawn one.** A GeoJSON source is tiled, so the drawn geometry is snapped to the tile grid (about 2 m at zoom 11), and the pod merges a clicked destination into a polygon search's row by coordinate alone, to a metre. `pointOf` on the layer answers by `osm_id`, and the place carries that id too, so a trailhead's card links to its object from the start.
- **A trailhead is the tag or a parking lot named as one.** Checked 2026-10-17 after the preview showed two markers in Issaquah: of its 14 named trailheads, 2 are `highway=trailhead` and 12 are `amenity=parking` with Trailhead in the name, Poo Poo Trailhead among them. The name pattern (`[Tt]rail ?[Hh]ead`, spelled once and read by the classifier too) matches 3,540 lots worldwide, counted in 66 s, so the clause is cheap, and it is English only because mappers elsewhere use the tag. The polygon search shares the clause, so it gains the same rows.
- **`ofm-climbing` is dropped**, and the style's own `poi` labels keep losing the `climbing` class, so a single route is not drawn or clickable. The `climbing` kind no longer arises; an old share link carrying one still opens.

## Evidence

Measured 2026-10-16 on `overpass-api.de`, worldwide, named features only, `[timeout:180]`, serially from one address:

| Query | Wall | Bytes | Elements |
|---|---|---|---|
| trailheads (`out center`) | 119.8 s | 2.8 MB | 12,954 (12,881 nodes, 73 ways) |
| crags and areas (`out center`) | 85.3 s | 9.0 MB | 13,519 (6,423 relations) |
| boulders and climbable stones (`out center`) | 75.4 s | 0.4 MB | 1,111 |
| all clauses, one query | 502 at once | | "at capacity, queue full" |
| all clauses, one query, `out tags center`, after a 4-minute wait | 191.7 s | 7.4 MB | 27,584 (18,820 nodes, 2,337 ways, 6,427 relations) |

`maps.mail.ru` answered 504 within 2 s to every attempt that day. The 502 body says the public endpoint is meant for browser and human-operated tools and points automated use at a self-hosted instance. Of the 27,584, 718 ways and relations carried no centre and are dropped; 445 carry an `ele`.

The sprite (`ofm_f384`) has no trailhead glyph. Twelve candidates were drawn at 17 px, 2x and 4x beside the peak, lake, town and climbing markers (https://claude.ai/artifact/1DGMsQMW7QKuZP7EAvapzA); the maintainer picked the signboard over a fingerpost, a hiker, a boot print, a trail fork, a blaze post and five sprite icons.

## Alternatives rejected

- **Ask Overpass for the visible area as the reader pans (option B).** Every pan past the zoom floor would spend a donated server that was answering 504 on 2026-10-15 and 2026-10-16, and every pan would wait on it.
- **Snapshot trailheads only and keep the tile climbing points (option C).** A clicked crag would stay `Climbing` with an OpenStreetMap link, and relation-mapped crags would stay invisible.
- **A regional snapshot.** Offered because a bounding box might be cheaper; the maintainer chose the world.
- **Keep `ofm-climbing` for routes under the crags**, suppressing a tile point whose name a snapshot crag carries. Two sources on one wall for a feature that cannot be analyzed.
- **Fill the set on the first request, answering 503 at once**, or **warm at startup behind an env knob**, both offered so CI containers would not run the worldwide queries. The maintainer chose an unconditional startup fill with sequential kinds, infinite retries and exponential backoff.
- **A `SnapshotCache` with a longer deadline.** Its cold path makes the first caller wait for the whole fetch, and its age limit would take a week-old set off the map for no reason.
- **Crags from zoom 14 and trailheads from 11, or trailheads from 9.** The maintainer chose one floor for both.

## Consequences

A clicked crag is a Crag with the Mountain Project link, and a crag clicked and then found by a polygon search is one row. Relation-mapped crags show. A trailhead can be clicked wherever OSM names one. The cost is about five minutes of one Overpass slot per pod start, and every container the image runs in pays it: the Lighthouse, Playwright and perf jobs each start one per PR, as do PR previews and canaries. A pod that boots into an Overpass outage shows no markers until a retry lands, and logs each attempt. Single climbing routes are no longer drawn or clickable. The chart needs `/api/landmarks` on `ingress.publicApiPrefixes` and the three env knobs in `extraEnv` (bluebird-helm), or production answers the route with the edge's 404 and the map shows no markers.
