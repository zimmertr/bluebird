# 0179. A relation stands at the centre of its own points, and only one made entirely of other relations is placed from them

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: place the climbing areas made of other areas, and then, shown what centring every relation on everything it holds did to the areas that also hold crags, "own points if it has any"
- Issues and PRs: #760, #734, #715
- Cited in code as: #760
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` and `app/services/places/` bullets; the [`fill/`](../../fill/CLAUDE.md) guide; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass
- Related: 0176 (the places table), 0178 (the crag rule), 0185 (the update places a relation through the API)

## Context

Overpass's `out center` places a relation at the centre of the bounding box of its own nodes and ways, and gives a relation made only of other relations no position at all. Climbing areas are often mapped that way: an area holds crags, and a larger area holds areas. Over Washington, 27 such areas (Leavenworth, Snoqualmie Pass, Peshastin Pinnacles, the Inner Walls at Index) had no position from Overpass or from a pass one level deep, and the worldwide query behind PR #756 dropped 718 ways and relations with no centre (2026-10-16). #760 first planned to place every relation at the centre of everything it contains, following the nesting.

## Decision

**A relation with member nodes or ways stands at the centre of their bounding box alone**, where Overpass puts it. **Only a relation with neither is placed from the relations it holds**, each boxed by the same rule, all the way down (`rules.relation_boxes`). The walk is depth first with an explicit stack, because a mapper can nest deeper than Python's recursion limit, and a cycle is cut where it closes. A relation with no geometry anywhere below it is left out. The fill and the daily update call the same function; the update's API path asks for up to 20 nested relations per relation (`MAX_NESTED`, 0185).

## Evidence

The fill's run over Washington's extract, 2026-10-18. Washington has 21 crag relations that hold both points of their own and other areas. Centred on everything they contain, 20 of them moved from Overpass's position by up to 1.24 km: Boston Basin 1,240 m, Quartz Camp 903 m, Index 613 m. Under the rule chosen they stay where Overpass has them, and 28 areas made only of areas are placed: the 27 above, and one more the wider crag rule takes (0178).

## Alternatives rejected

- **The centre of everything a relation contains**, as #760 was filed. Moved 20 mixed areas by up to 1.24 km.
- **One level of member relations.** Leaves the deeper areas without a position.
- **No position for a relation made only of relations**, as Overpass and PR #756 had it. Leavenworth and Snoqualmie Pass would have no row and no marker.

## Consequences

Leavenworth and Snoqualmie Pass show as climbing areas in a search and on the map. Every relation with points of its own stands where Overpass puts it, so the fill can be checked against an Overpass answer place for place. A relation made only of areas stands at the centre of a box around them, which can fall between its crags rather than on rock.
