# 0305. A point in a cell no place shares reads the snow depth history of the nearest place within 150 m

- Status: Accepted. Amends [0295](0295-snow-depth-returns-beside-snowfall.md) (what a coordinate in a cell no place shares reads)
- Date: 2026-11-21
- Decider: the maintainer (TJ), 2026-11-21, choosing "A. Fall back to the nearest place" over leaving three Smoots with today's depth alone
- Issues and PRs: #849
- Cited in code as: #849
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/snow_history.py` and `app/services/places/__init__.py` bullets; [`docs/API.md`](../API.md), Snow depth; [`docs/DATA.md`](../DATA.md), Snow depth

## Context

The snow depth history keeps a year of days only at the 1 km cells the places table's places stand in (record 0295), and a coordinate in any other cell read today's grid alone. On 2026-11-21, with the year filled, a year's window over the Smoot 100 read every day at 97 peaks and today alone at three: Forbidden Peak, Mount Deception and Lemah Mountain. The places table holds each of them, and the two measured stand within metres of the list's coordinate: Forbidden Peak 5 m and Mount Deception 28 m. Each sits across a cell edge from its list coordinate, so the history held the summit's cell and the list read the one beside it.

## Decision

A point whose cell has no row in the history reads the cell of the nearest place of any kind within `NEAR_PLACE_M`, both for the window's days and for today's grid, so the two agree. `NEAR_PLACE_M` is `osm.enrich.CUSTOM_MATCH_RADIUS_M`, 150 m, the reach a pasted point is matched to its summit by, so a row the app names after a peak reads that peak's snow. A point whose own cell holds a place keeps it, even with a closer place across an edge: the fallback runs only after both history reads (the window's days and the newest day) find nothing for the cell. A point with no place that close reads today's grid alone, as before.

## Evidence

- 2026-11-21, production `/api/snow-depth`, 2025-11-21 to 2026-11-21: 97 of the Smoot 100 read 366 of 366 days and three read one. Forbidden Peak's list coordinate (48.511643, -121.058324) read 1 day and OSM's node 5 m away (48.5116613, -121.0583879) read 366; Mount Deception's read 1 and OSM's node 28 m away read 366. Lemah Mountain was not measured, because the route's per-address limit answered 429 first.
- `CUSTOM_MATCH_RADIUS_M` was measured on 2026-07-30 against the same list: 97 of 100 matched the intended peak at 150 m.

## Alternatives rejected

- Leaving it: three of a hundred list peaks, and any pasted coordinate near an edge, would show no history for a summit the table holds.
- Keeping the cells around every place as well: nine cells a place is about nine times the table, roughly 2.7 GB a year.
- Moving the lists' coordinates onto OSM's nodes: it mends the bundled lists and no coordinate a reader pastes.

## Consequences

A point read this way reads a cell up to 150 m and one cell edge from where it stands, which is the summit's own cell when the place is the summit. A lookup with such points makes up to two more queries, the nearest place and that place's days, and a lookup whose points all sit in place cells makes none. A fresh database with no rows yet sends every point through the lookup, harmlessly, because every cell it finds is empty too.
