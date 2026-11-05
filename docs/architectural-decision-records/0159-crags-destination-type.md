# 0159. Crags are the fourth polygon destination type, found from crags, areas and boulders

- Status: Accepted; amended by [0177](0177-one-place-per-kind-and-name-within-300-m.md), [0178](0178-crag-rule-widened.md), [0180](0180-trailhead-and-crag-markers-from-the-places-table.md) and [0221](0221-crag-search-names-its-state.md)
- Date: 2026-10-15
- Decider: the maintainer (TJ), on issue #715, 2026-10-15
- Issues and PRs: #715, PR #731
- Cited in code as: #715
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, step 2; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass

## Context

The Destinations section's type row carried three checkboxes, Peaks, Lakes and Trailheads, and at the panel's 360px width it had room for one more short label. The maintainer narrowed the field to two on 2026-10-14: climbing areas, or cities and towns. Mountain passes and huts were vetoed the same day.

## Decision

- **The type is `crag`**, a member of `DestinationType` on both sides, in `IMPLEMENTED_TYPES`, and in the share link's `DISCOVERY_TYPES`.
- **The clause is `["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"]`**, as three clauses (node, way and relation) in `_CLAUSES`, the way the lake clauses are written, plus `["natural"="stone"]["sport"="climbing"][!"climbing"]["name"]` for nodes and ways, and `_classify` reads the same tags. It is never widened to bare `sport=climbing`.
- **Boulders are crags.** The first cut took crags and areas only. On 2026-10-15, after Midnite Boulder at Index was not found, the maintainer added boulders, knowing a boulder field can add many rows a few metres apart. A boulder is mapped either as `climbing=boulder` or as a climbable stone with no subtype (Midnite Boulder is `natural=stone` and `sport=climbing` alone), so both are asked for, and `[!"climbing"]` keeps a stone tagged as a route out. Boulders take the Crag type, checkbox and Mountain Project link; no fifth label was added.
- **The checkbox reads Crags**, and the row is Peaks, Crags, Lakes, Trailheads.
- **A crag row's name links to a Mountain Project search by name** (`destinationUrl.ts`), rather than to its OSM object.
- **The copy that listed the types now names none**: the tutorial's destinations step, the Overpass line `/api/capabilities` publishes, the API description and the README say "destination" or "places", approved verbatim on 2026-10-15, so a fifth type changes none of them.
- **A crag named for the peak it stands on is its own row.** Discovery's identity for a mapped feature is its type and its name (`query_osm`), not the name alone, and a custom row claims a discovered one by its coordinate only (`_merge_custom`), so a pasted row and a discovered row of one name at different points are two rows, Custom and Peak. The maintainer decided both on 2026-10-15.
- **The chart tells two rows of one name apart by their type**, composed through `TYPE_COL`'s formatter: `The Tooth (Crag)` and `The Tooth (Peak)`, and under a comparison one bracket, type first: `1. The Tooth (Crag, NOAA GFS)`. It shows on both of the pair and only while both are on screen, in the lines, the hover box, the legend chips and the Removed list. A name no other place shares reads exactly as before. The formats were approved on 2026-10-15.
- **The map's climbing labels wear a climber on a rock** (`CLIMBING_IMAGE` in `basemap.ts`), in place of the sprite's `circle_stroked_11` that 0157 named. The maintainer picked it on 2026-10-15 from nine drawn in the sprite's own frame: a white disc, a `#bbbbbb` ring and a `#725a50` glyph, read off `mountain_11` and `water_11`, at the sprite's @2x size so it stands at 17px like a peak. It is drawn on a canvas, as the hover glow is, and a browser with no 2D canvas keeps the circle. The tiles cannot tell a crag from a route, so every climbing label wears it.
- Crags never join `TILE_TYPES`: the basemap's tiles carry climbing points (`class=climbing` in the `poi` layer) but no `climbing=` subtype, so a crag cannot be told from a route, and crags mapped as relations are not in them. A ring with Crags ticked therefore asks Overpass, as one with Trailheads ticked does. A crag with no `ele` takes the unknown-elevation path lakes and trailheads take, and no elevation lookup is added for it.

## Evidence

Measured 2026-10-15 through Overpass over 47.0 to 48.0 N, 121.8 to 120.8 W, named features only:

| Tag | Named features |
|---|---|
| `sport=climbing`, all | 183 |
| `climbing=crag` | 82 |
| `climbing=area` | 22 |
| `climbing=route` | 67 |
| `climbing=route_bottom` | 5 |
| `climbing=boulder` | 4 |
| no `climbing=` key | 3 |

The 104 crags and areas were 45 nodes, 9 ways and 50 relations, and none carried `ele`. An area nests crags (Index is an area and Lower Town Wall a crag inside it), so a ring can list both. 6 of the 104 share a name with a `natural=peak` node in the same box: Chair Peak, The Tooth, The Fang, Stegosaurus Butte, Bessemer Mountain and Quartz Mountain. With the name alone as identity, one of each pair was dropped whenever Peaks and Crags were both ticked: whichever Overpass listed first on the pod's path, and always the crag on the tile path, because the tile peak rides to the pod as a custom row and `_merge_custom` let a custom row claim a discovered one by name.

On 2026-10-15 a Mountain Project search for `Lower Town Wall` listed the area (`/area/105790643/lower-town-wall`) in its Areas section.

The tiles, decoded 2026-10-15 from OpenFreeMap's planet build of 2026-10-11: the zoom-14 tile over Index (14/2659/5707) carries 57 named `class=climbing` points in its `poi` layer, with no `climbing=` subtype. Of OSM's named climbing features inside that tile, it held 33 of 36 routes, 1 of 1 boulder, 3 of 12 crags and 0 of 4 areas. Issue #715 said no OpenMapTiles layer has a climbing class; that was wrong, though the conclusion it drew, that a crag ring must ask Overpass, stands.

The row: the four labels take 289.8px of the 327px row at the 360px panel, and stay on one line down to a 322px row; below that the row wraps.

## Alternatives rejected

- **Cities and towns** (#116, closed 2026-07-31). A valley floor beats every summit on wind and temperature, so a ring with Cities and Peaks ticked ranks to no purpose, and the box held 50 settlements, most of them hamlets nobody plans a trip around.
- **Bare `sport=climbing`.** It brings every route with it: in the measured box, 67 routes and 5 route bottoms would each have been a row.
- **Leaving boulders out**, the first cut. A boulder is a place a climber plans a day around, and the maintainer chose to have them, rows and all.
- **Crags without areas.** Some places are mapped only as an area, and leaving areas out loses them.
- **Eight other climbing icons**: a climber at a vertical or a slab wall, a crack, a faceted boulder, a carabiner, a quickdraw, a chalk hand and a bolt-on hold. Four more were drawn and dropped before the maintainer saw them, because at 17px they read as a bin, a search icon, the number 8 and a gallows.
- **A link to the OSM object**, as lakes and trailheads have. The maintainer chose Mountain Project, which is where a climber looks a crag up.

## Consequences

`test_osm.py` holds the three clauses, their absence when crags are not asked for, and the two stone clauses, and the classification of a crag node, an area relation, a boulder, a bare climbable stone, a stray route and a stone tagged as a route; `test_models.py` holds the enum's members, `test_analyze.py` and `clientAnalyze.test.ts` the over-cap noun (mirror row 18), `urlState.test.ts` the `type=crag` round trip, `DestinationsSection.test.tsx` the checkbox and its order, `destinationUrl.test.ts` the Mountain Project link, and `test_capabilities.py` reads `IMPLEMENTED_TYPES`, so the type is published with no test of its own. `test_osm.py` also keeps a peak and a crag of one name, `test_analyze.py` keeps a custom row and a discovered row of one name at two points (and `analyze_golden.json`'s union case now carries both), and `chartData.test.ts`, `modelCompare.test.ts` and `menuSheets.test.tsx` hold the type in the chart's names and the Removed list. `test_security_headers.py` lists `www.mountainproject.com` as a link-only host. The `add-destination-type` skill now names every file this type touched. OSM's coverage of crags is uneven: the popular areas are mapped and the obscure ones are not, which `docs/DATA.md` says.
