# 0178. A crag is also a crag tag with no sport, climbing on natural rock, or a climbing site, and never a gym or a lone route

- Status: Accepted. Amends 0159 (its clause, which 0159 said would never take a bare `sport=climbing`).
- Date: 2026-10-18
- Decider: the maintainer (TJ), on issue #760, 2026-10-18: widen the crag rule as measured over Washington
- Issues and PRs: #760, #734, #715 and PR #731 (the crag type)
- Cited in code as: #760
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture step 2; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/osm/` bullet; [`docs/DATA.md`](../DATA.md), OpenStreetMap and Overpass
- Related: 0159 (the crag type), 0179 (where a climbing area made of areas stands), 0180 (the crag markers)

## Context

0159's rule took `sport=climbing` with `climbing=crag`, `area` or `boulder`, or a climbable `natural=stone` with no subtype. It refused a bare `sport=climbing`, which also tags every route: over 47.0 to 48.0 N, 121.8 to 120.8 W on 2026-10-15 that tag found 183 named features, of which 82 were crags, 22 areas and 4 boulders, and 67 routes and 5 route bottoms. Crags tagged another way stayed out of a search and, once #734 drew crags from the same rule, off the map. At Index, Hag Crag carries `climbing=crag` and no sport, and K Cliff and Ozone are `type=site` relations with `sport=climbing`.

## Decision

A crag is now any of:

- 0159's rule, unchanged.
- A `climbing=crag`, `area` or `boulder` tag with no `sport` (Hag Crag).
- `sport=climbing` with no `climbing=` key on `natural=cliff`, `bare_rock` or `rock` (Ozone Wall, Icicle Buttress).
- A `type=site` relation with `sport=climbing` and no `climbing=` key (K Cliff, Ozone).

The three new clauses refuse a feature tagged `leisure`, `building`, `shop`, `club`, `amenity` or `tourism` (`NOT_OUTDOOR`), which marks a gym or a business. 0159's rule does not read that list, so a crag it took stays one even where `tourism` marks it as an attraction. A point carrying only `sport=climbing` is never a crag, since that is most often a single route. `rules.CLAUSES` and `rules.classify` state the rule twice, side by side, and `tests/test_osm_rules.py` holds them to one table of tagged examples.

## Evidence

Over Washington on 2026-10-18 the wider rule found 37 more crags, 20% more than the old rule: 11 with a crag, area or boulder tag and no sport, 24 with `sport=climbing` on a cliff, bare rock or rock, and 2 climbing sites. Another 40 `sport=climbing` features in Washington were gyms and attractions, every one indoors or built, and `NOT_OUTDOOR` refuses them all. The fill's run over the extract the same day kept 254 crags: 189 under the old rule, 37 from the new clauses, and 28 placed only through member relations (0179).

## Alternatives rejected

- **A bare `sport=climbing` anywhere.** Takes every route, by the 2026-10-15 count above.
- **0159's rule as it was.** Leaves Hag Crag, K Cliff and Ozone out of a search and off the map.

## Consequences

A ring with Crags ticked returns more rows, and the map draws more crag markers. This is `RULES_VERSION` 1, the rules the first fill builds under; a later change to any rule bumps the version, and the next daily fill check rebuilds the whole table from the planet (0184). The live Overpass path asks the same six clauses, so a deployment without the database finds the same crags.
