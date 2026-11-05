# 0185. A changed way or relation a day file cannot place is asked of Overpass by id

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: "Overpass by id", chosen once OpenStreetMap's API usage policy was read, over the API fetch chosen earlier that day. The batch size and the second query for nested areas are Claude's, building #760, for the maintainer's review on the pull request.
- Issues and PRs: #760
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/places/update.py` bullet; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass; [`docs/TRAFFIC.md`](../TRAFFIC.md), Outbound; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), The shared cache
- Related: 0176 (the places table and its daily update), 0179 (where a relation stands), 0184 (the planet fill)

## Context

A day file lists every element created, edited or deleted that day, and nothing else. An edited way arrives with its list of nodes, but a node it did not move does not arrive, so the file cannot place the way. A relation's members' points are almost never in it. Overpass placed every shape on each query; the places table has to place them itself.

Earlier on 2026-10-18 the maintainer chose to fetch each such shape whole from OpenStreetMap's own API (`/api/0.6/{type}/{id}/full`), and then, shown the day file 5149 measurement below, to fetch redrawn shapes as well as new ones. That choice rested on Claude's framing, which had not read the API's usage policy. The policy says the editing API "is provided in order to edit the map data, not for read-only purposes or projects", and points read-only users at the planet file and at Overpass (read 2026-10-18).

## Decision

**A node places itself, and a way is placed from the file when every point it names is in the same file**, which is how a newly drawn lake arrives.

**Otherwise the table keeps where the shape stood, and the shape waits in `places_pending`** whenever it can have moved: some of its points changed that day, or the table never held it. Every edited relation waits. A shape the table holds is not placed again when only its points move without an edit to the shape itself.

**Each hourly run asks Overpass for the waiting shapes by id, in one query**: the oldest `PENDING_PER_QUERY` (2,000), `(way(id:…);rel(id:…););out tags center;`, through the same mirror chain as discovery, counted under the `update` path label. Overpass boxes a relation around its own nodes and ways, which is the fill's rule (0179), so its centre is the table's point. An area made only of other areas has no centre there; for those a second query, `(rel(id:…);>>;);rel._;out bb;`, brings every relation inside them with its own box, and `rules.relation_boxes` places them the way the fill does. A shape the answer does not hold, or the rules no longer keep, leaves the table. A run Overpass does not answer leaves every shape at its old point for the next run, and the refresh does not count it a failure, since nothing is lost.

## Evidence

Planet day file 5149 (2026-10-17, 115.7 MB), measured 2026-10-18 with the update's own `read_changes` and `apply`:

- Read in 43.7 s at a peak of 224 MiB; 849,568 nodes, 445,258 ways and 17,858 relations edited or deleted.
- 344 places written: 311 peaks, 20 lakes, 9 crags and 4 trailheads.
- 1,510 kept shapes the file could not place: 749 ways and 398 relations that can have moved, and 363 ways with none of their points in the file, which wait only if the table never held them. A day therefore fits one query.
- The apply took 3.1 s for 1,312,684 edited ids against a 4-million-row table.

Both queries were tried against overpass-api.de on 2026-10-18 with two Index climbing areas from Geofabrik's Washington extract. Planet Index (relation 19289302), which holds points and areas, came back with a centre. Inner Walls (19289462), made only of areas, came back with none, and the second query returned its four descendant areas, each with a box around its own points alone.

## Alternatives rejected

- **OpenStreetMap's API, one shape a second** (chosen first, then reversed the same day): about 1,150 to 1,500 requests a day of read-only use, which the API's policy rules out, and which "may be blocked without notice".
- **No fetch**: a redrawn shape keeps its old point, and a new shape missing points stays out, until the next refill, which comes only with a rule change or by hand (0184).
- **A copy of every point on the planet**, so the update could place any shape itself. About 4 GB (estimated), a second dataset to keep in sync.

## Consequences

The pod holding the `osm` refresh sends Overpass at most one query an hour for these shapes, usually one a day with work in it, and a second only for an area made only of areas. While Overpass is down the shapes keep their old points and are asked again each run. A held lake whose points are moved without an edit to the lake keeps its old centre until someone edits the lake or the table is refilled.
