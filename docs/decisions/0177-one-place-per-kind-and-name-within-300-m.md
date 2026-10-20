# 0177. Places of one kind and one name within 300 m are one place, merged when they are read

- Status: Accepted. Amends 0159 (a mapped feature's identity is its type, its name and where it stands, where 0159 had its type and name across the whole ring).
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: same kind and name within 300 m is one place, keeping the more specific feature (a `highway=trailhead` node over its lot), and places that share a name farther apart are each a row. Merging when a reader reads, rather than in the table, is Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760, #734, #715 (the type joined the identity)
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` and `app/services/places/` bullets; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass; [`docs/API.md`](../API.md)
- Related: 0159 (the crag type, and a crag named for its peak), 0176 (the places table), 0180 (the markers merge the same way), 0012 (an unnamed summit's made-up name)

## Context

Before #760 a search kept one row per kind and name across the whole ring (`query_osm`). That made one row of a summit OSM carries twice, and of a trailhead mapped as a node beside the lot named for it. It also dropped every other place that shares a name. Over Washington's extract on 2026-10-18, 657 peaks, 669 lakes and 91 trailheads shared a name with a different place more than 1 km away (17 Lost Lakes, 17 Green Mountains), and a ring around two of them showed one. The trailhead and crag markers (0180) needed a rule too, since a marker should be the row a ring around it returns.

## Decision

**Places of one kind and one name within 300 m are one place** (`rules.merge_neighbours`, `MERGE_RADIUS_M`). Farther apart they are separate rows, so a search of Washington lists every Lost Lake. The kind is part of the rule, so a crag named for the peak it stands on is still a second row (0159).

**The more specific feature stands for the group.** Rows sort by `rules.preference`, where a parking lot ranks after anything else, so a `highway=trailhead` node beats the lot named for it; then node before way before relation; then by id. A row is dropped only when it lies within 300 m of a row already kept. An unnamed summit's made-up name (`Peak 5961`) never merges, since two of those are two summits.

**The merge runs when a reader reads.** Discovery from the table, the live Overpass path and the markers each merge what they read. The table keeps one row per OSM element, with the preference stored beside it as `rank`, so the daily update can replace a row by its id. The markers read a box padded by the radius, so a node just outside the view still stands for the lot just inside it.

**The results table, the removals and the share links already keyed a row by its coordinate** (`geoKey`), so two places of one name at different points were already two rows there. #760 asked for that check before the rule changed.

## Evidence

Same-named pairs over the fill's validation output for Washington's extract, 2026-10-18:

| Kind | Pairs within 300 m | Next pair beyond it |
|---|---|---|
| Trailhead | 105, the farthest 269 m; 70 are a trailhead node beside its lot | 342 m |
| Peak | 5, the farthest 52 m | 344 m |
| Crag | 4, Moai among them | |
| Lake | 40 | 88 more pairs between 300 m and 2 km |

Trailheads and peaks have a gap at 300 m. Lakes have none, since a lake mapped in parts and two lakes that share a name look alike from their centres.

## Alternatives rejected

- **One row per kind and name across the ring**, as before. A ring around seventeen Lost Lakes showed one.
- **Merging in the table at fill time**, as #760's plan first had it. A daily edit to one member would then mean rebuilding its group, where one row per element is replaced by id.

## Consequences

Where names repeat, a ring returns more rows than before, and each one counts toward the analysis cap. Moai draws once, and a trailhead node beside its same-named lot draws one marker. Two lakes of one name less than 300 m apart read as one row, as a lake mapped in parts does. The live Overpass path and the table merge with the same function and the same order, so a ring reads the same either way.
