# 0067. The pod holds one Region 6 closure snapshot and filters it by bbox and kind

- Status: Accepted
- Date: 2026-09-30
- Decider: TJ (#550)
- Issues and PRs: #550, #551, #203
- Cited in code as: #550
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/usfs_closures.py` bullet

## Context

The map drew no closure orders, so a ranked destination could sit inside an area a hiker may not enter. The US Forest Service publishes the fire closure orders of its Pacific Northwest Region (Region 6: Oregon and Washington) as one public ArcGIS feature service with three layers: closed sites as points, closed trails and roads as lines, and area closures as polygons. The quota belongs to the Forest Service's ArcGIS organization and is shared with every other consumer, which is the failure mode [0007](0007-national-wildfire-snapshot.md) removed from the fire overlay. No national feed exists.

## Decision

The pod holds one snapshot of the whole region, fetched through `cache_factory` like the wildfire one, and `GET /api/closures` filters it by bbox and by `kind`. `area` is the polygons. `trail` is the lines and the points together, because a closed trailhead is a closed way in. Lines and polygons come at both fidelities, at the wildfire tolerance; points come once and serve both. The feed's `ClosureStatus='Active'` is trusted as sent, and nothing filters on the end date. The map shows the data as two rows in the Layers menu, one per kind. The results table tests a destination against the area polygons only.

The same change moved the ArcGIS habits both feeds share into `app/services/arcgis.py`, including a page-flag reader that looks under `properties` as well as at the top level.

## Evidence

Measured 2026-09-30 with `where=ClosureStatus='Active'` and `f=geojson`:

- 174 points (0.1 MB), 1,536 lines (5.8 MB full, 1.4 MB at the ~56 m tolerance), and 15 polygons (1.2 MB full, 0.08 MB simplified). The region fits in a pod, so nothing keys on the caller's bbox.
- The line layer's `maxRecordCount` is 1,000, so it arrives in two pages. In `f=geojson` ArcGIS reports the page flag as `properties.exceededTransferLimit`, not at the top level. The wildfire pager read the top level only and had never met a second page.
- An `outFields` list naming a field the layer lacks answers HTTP 200 with `{"error":{"code":400,...}}`, so each layer asks for its own fields.
- The Eagle Creek area closure (Mt. Hood National Forest) is marked active with an end date of 2026-07-07. `ClosureURLlink` is null on 629 of the first 1,000 lines.
- The slowest page took 1.7 s (the first full-resolution line page, 4.2 MB).

## Alternatives rejected

- The browser queries ArcGIS itself: every visitor spends the organization's shared quota, which is what #203 undid.
- A date filter beside the status: it hides orders the Forest Service still marks active. TJ chose to trust the status and show the dates (2026-09-30).
- A distance test against closed trail lines for the table: a trail near a peak is not always its route, and one closure alone holds 600 segments, so the column would over-warn.
- Other regions in the same change: Regions 3 and 4 publish every standing forest order under another schema with no status field. That is #551.

## Consequences

`test_usfs_closures.py` pins the two-page fetch with the flag under `properties`, the per-layer fields, and the coverage outline against named places; `test_nifc.py` pins the same flag for fires. The coarse tolerance is read from `nifc.COARSE_OFFSET_DEG`, so mirror row 10 still names one backend value. Coverage is Oregon and Washington only, and a row elsewhere reads `N/A`. An order the Forest Service forgets to close stays on the map until it does.
