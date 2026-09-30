# 0068. A Region 3 or 4 forest order is an area closure when its citation or its text closes the area to entry, and closure coverage is per kind

- Status: Accepted
- Date: 2026-09-30
- Decider: TJ (#551)
- Issues and PRs: #551, #550
- Cited in code as: #551
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/usfs_closures.py` and `app/services/usfs_coverage.py` bullets

## Context

[0067](0067-region-6-closure-orders.md) drew closure orders for Region 6 alone, so a destination in Arizona, New Mexico, Nevada, Utah, southern Idaho or western Wyoming read `N/A`. The Southwestern Region (Region 3) and the Intermountain Region (Region 4) publish their orders on the same ArcGIS organization, as polygons, under a lowercase schema with no status field. Those feeds hold every standing forest order, not closures: fire restrictions, motor vehicle rules, float permits and closures sit side by side. The map and the Closure column need the orders that keep a person out, and nothing else.

## Decision

An order from Region 3 or 4 counts as an area closure when its `cfr` text cites 36 CFR 261.52(e) or 261.53(e), which prohibit "going into or being upon" an area, OR its `description` or `ordername` says entry is prohibited (`going into or being (up)on`, `entering or being (up)on`, `being in or on`, `closed to (all )?(public )?(entry|access)`, case-insensitive). The citation is read per section: each 261.52 or 261.53, up to the next section number, counts when that stretch holds a paragraph `(e)` in any case, so `261.53(a), (c) and (e)` counts and `261.50(a) and (e)` does not. A text match does not count when its own sentence (from period to period) also says `without (a |an )?(valid )?permit` or `unless … permit`, because that sentence is a permit rule. `is_area_closure` in `usfs_closures.py` is the one place the rule lives. An order is live when `rescinddate` is null and `enddate` is null or ahead.

A Region 3 or 4 feed that fails is dropped from the snapshot with a warning, and the snapshot records which regions it holds; a failed Region 6 query still fails the fetch. The feeds are read in two phases: every live order's attributes, then the geometry of the passing object IDs alone, at both fidelities, and no geometry request when nothing passes. Each passing order is mapped onto Region 6's property names, and every feature carries `ClosureSource` and `ClosureType`. The `area` kind reads all three regions after Region 6's polygons; the `trail` kind stays Region 6.

Coverage is per kind. `trail` keeps the Oregon and Washington outline. `area` adds Arizona and New Mexico, Nevada and Utah, southern Idaho below the Salmon River, and western Wyoming, each coarse and ~0.2° outward on land, composed from the regions the snapshot holds. In Wyoming the east edge follows the Continental Divide rather than a meridian, because the Shoshone, east of it, is Region 2. In Nevada the outline is cut back around two Region 5 units, the Inyo's White Mountains (Boundary Peak) and the Lake Tahoe Basin's Nevada shore.

## Evidence

Measured 2026-09-30 over the live orders (Region 3: 96; Region 4: 214):

| Test | Region 3 passes | Region 4 passes |
|---|---|---|
| `ordertype` allowlist | 58 | 132 |
| `cfr` cites 261.52(e) or 261.53(e) | 29 | 3 |
| Text says entry is prohibited, no permit in the sentence | 17 | 4 |
| Either (the rule) | 32 | 5 |

- Region 4 files "Reckless Driving" and "Bridge Load Limits" as "Safety Closure", so the type allowlist passes orders that close nothing.
- Without the permit exception the text test passed 5 in Region 4. The sixth was order 26008, the South Fork Salmon River and Big Creek float permit: "Entering or being on the South Fork of the Salmon River … with float boating equipment without a permit." That is a permit rule (review of #551).
- The citation is spelled many ways: `36 C.F.R. § 261.53(e)`, `36 CFR 261.53 (e)`, `36 CFR 261.50(a) and (e), 36 CFR 261.53(e)`. The pattern keys on the section alone.
- Full-resolution geometry for every live order is 29.9 MB in Region 4 (2.2 MB at the ~56 m tolerance) and 5.5 MB in Region 3 (0.8 MB). One live `fetch_snapshot` before the permit exception made 13 requests in 2.8 s and held 53 areas (15 from Region 6, 32 from Region 3, 6 from Region 4): 3.2 MB full and 0.26 MB coarse. A second fetch after it made the same 13 requests in 1.2 s and held 52 areas (15, 32 and 5): 3.0 MB full and 0.25 MB coarse.
- `rescinddate IS NULL AND (enddate IS NULL OR enddate > CURRENT_TIMESTAMP)` answers 96 and 214 on the two services.

## Alternatives rejected

- An `ordertype` allowlist: it over-flags, 58 and 132 passes against 32 and 5, because a type such as "Safety Closure" covers orders that keep nobody out.
- Drawing every order: a fire restriction or a vehicle rule is a different picture from ground a person may not enter, and the Closure column would flag rows that are open.
- Waiting for a national feed: none is published, and these two regions are on the organization the pod already reads.
- All or nothing: one failed Region 3 or 4 query failed the whole snapshot, and on a cold pod that took Region 6's trails down with it.
- A box to -109.0 for western Wyoming: it claims the Shoshone (Region 2) and Cody, where a row would read "checked, nothing found" from feeds that cannot see it.

## Consequences

`test_usfs_closures.py` pins the rule against the spellings the feeds use, a reckless-driving "Safety Closure" and the float permit, a failed feed that drops its region alone, the two-phase fetch (only passing IDs, no `where`, nothing sent when nothing passes), the mapping, the join order, and each kind's coverage against named places. A text test can be wrong both ways: an order that closes an area in words neither signal matches is left out, which is why DATA.md tells the reader to read the order itself. The Wyoming and Idaho outlines are coarse traces of region boundaries rather than state lines, so a place near them is decided by the bias band.
