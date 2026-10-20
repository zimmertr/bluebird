# 0180. The map's trailhead and crag markers come from the places table, from zoom 11, always on

- Status: Accepted. Supersedes 0157 in part (the climbing labels: `ofm-climbing` is gone, and a single route is neither drawn nor clickable). Amends 0159 (the climber marks the crag markers rather than the tiles' climbing labels).
- Date: 2026-10-18. The zoom floor, the icons, always on and dropping `ofm-climbing` were decided on 2026-10-16, and the parking-lot trailhead on 2026-10-17, on #734.
- Decider: the maintainer (TJ), on issue #734, 2026-10-16 and 2026-10-17: both kinds from zoom 11, the signboard icon, always on with no Layers row, `ofm-climbing` dropped and routes kept off the map, and a parking lot named as a trailhead is a trailhead; on issue #760, 2026-10-18: those calls carried over, the markers read from the database, and PR #756 closed and ported rather than merged. The padded box and the map asking nothing inside a 503's wait are Claude's, building #760.
- Issues and PRs: #760, #734, PR #756 (closed 2026-10-18, ported), bluebird-helm#382 (closed, ported), #732, #715 and PR #731, #119, #580
- Cited in code as: #734, #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/landmarks.py`, `app/services/places/` and `app/ratelimit/` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `landmarks.ts`, `basemap.ts`, `features.ts`, `poiPopup.ts` and `overlays/` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `landmarks.ts`, `basemapPoi.ts` and `poiPopup.ts` bullets; [`docs/USAGE.md`](../USAGE.md), Click a destination; [`docs/DATA.md`](../DATA.md); [`docs/API.md`](../API.md); [`docs/TRAFFIC.md`](../TRAFFIC.md); [`docs/CONFIGURATION.md`](../CONFIGURATION.md)
- Related: 0157 (places and climbing labels selectable), 0159 (the crag type and its icon), 0176 (the places table), 0177 (one place per kind and name), 0179 (climbing areas made of areas), 0016 (an overlay is never a knob)

## Context

After #732 the map's climbing labels came from the basemap's `poi` layer, which drops OSM's `climbing=` tag. A crag, a boulder and a single route were all added as `Climbing` with an OpenStreetMap link, and a crag mapped as a relation was not there to click (Index, 14/2659/5707: 3 of 12 crags and 0 of 4 areas). No tile carries a trailhead at all (Lake 22 and Mailbox Peak checked on 2026-10-15, Mount Si in #732). #734 decided to draw both from a worldwide set the pod held. PR #756 built that set as an in-memory snapshot each pod filled from Overpass at startup (its record 0171), and was closed unmerged on 2026-10-18 when #760 put the same data in the places table.

## Decision

- **`GET /api/landmarks?bbox=` answers the table's named trailheads and crags inside the box** as GeoJSON points carrying `name`, `kind`, `osm_id` and `elevation_ft`. It merges them by 0177 over a box padded by the merge radius and split at the antimeridian, so a marker is the row a ring around it returns. `fetched_at` is when the table was last brought up to date: the last day file applied, or the fill. While the table cannot answer (no database, or no completed fill) the route answers 503 with `Trailheads and crags are not available yet. Try again later.` and `Retry-After: 300`.
- **The route has its own rate bucket**, 90 a minute with a burst of 30 when it shipped (`RATE_LIMIT_LANDMARKS_PER_MINUTE`, `RATE_LIMIT_LANDMARKS_BURST`), counted across pods like the rest (0181). `GET /api/capabilities` publishes today's as `landmarks_per_minute` and `landmarks_burst`. The chart adds `/api/landmarks` to `ingress.publicApiPrefixes`.
- **The map draws both kinds from zoom 11** (`LANDMARK_MINZOOM`), the trails' floor, from a GeoJSON source of its own (`map/landmarks.ts`) refetched for the viewport after each pan, always on, with no Layers row. A trailhead wears a drawn signboard (`TRAILHEAD_IMAGE`) and a crag the climber from 0159, and crag icons collide away. Both layer ids are in `POI_LAYERS`, so a click opens the same card a peak does. A pan inside a 503's `Retry-After` asks nothing (`overlayRecovery().waiting()`), so a deployment with no database does not fetch and log a failure on every pan.
- **A clicked marker takes the exact point the layer fetched**, by `osm_id` (`pointOf`), not the drawn one. A GeoJSON source snaps its geometry to the tile grid, about 2 m off at zoom 11, and the pod merges a clicked destination into a polygon search's row by coordinate alone, to a metre. The place carries the `osm_id` too, so its card links to its own object.
- **A trailhead is the tag or a parking lot named as one.** The pattern (`[Tt]rail ?[Hh]ead`, `TRAILHEAD_LOT_NAME`) is spelled once in `rules.py`, and the Overpass clause and `classify` both read it. English only, because mappers elsewhere use the tag. The polygon search shares the clause.
- **`ofm-climbing` is dropped**, and the style's own `poi` labels keep losing the `climbing` class, so a single route is neither drawn nor clickable.

## Evidence

Carried from PR #756's record, where it was measured:

- Issaquah, 2026-10-17: of the 14 named trailhead features in a box around it, 2 were `highway=trailhead` and 12 were `amenity=parking` with Trailhead in the name, Poo Poo Trailhead among them. The name pattern matched 3,540 lots worldwide, counted in 66 s.
- The sprite (`ofm_f384`) has no trailhead glyph. The maintainer picked the signboard from twelve candidates drawn at 17 px (https://claude.ai/artifact/1DGMsQMW7QKuZP7EAvapzA).
- Worldwide on 2026-10-16, Overpass took 119.8 s for 12,954 named trailheads and 85.3 s for 13,519 crags and areas.

## Alternatives rejected

- **A worldwide set each pod fills from Overpass at startup** (PR #756). About five minutes of an Overpass slot per pod start, paid by every container the image runs in, CI's included, and a pod that started during an Overpass outage showed no markers until a retry landed.
- **Ask Overpass for the visible area on each pan** (#734's option B). Every pan would spend and wait on a donated server that answered 504 on 2026-10-15 and 2026-10-16.
- **Trailheads only, keeping the tile climbing points** (#734's option C). A clicked crag would stay `Climbing`, and crags mapped as relations would stay invisible.
- **Keep `ofm-climbing` for the routes under the crags.** Two sources on one wall, for a feature that cannot be analyzed.
- **Crags from zoom 14 and trailheads from 11.** The maintainer chose one floor for both.

## Consequences

A clicked crag is a Crag with the Mountain Project link, and a crag clicked and then found by a polygon search is one row. Crags mapped as relations show, and so do climbing areas made of areas (0179). A trailhead can be clicked wherever OSM names one. Single climbing routes are no longer drawn or clickable. A deployment without the database, or before its first fill, draws no trailhead or crag markers. Every pan at zoom 11 or closer sends the pod the box on screen, which the privacy page says. No pan asks an upstream anything.
