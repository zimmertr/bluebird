# 0117. A Layers row carries no coverage in its label; it greys over a view its layer cannot draw on

- Status: Accepted
- Date: 2026-10-07
- Decider: the maintainer (TJ), on PR #676, choosing the greyed row over a consistent parenthetical and over dropping the coverage outright, from a mockup of the three
- Issues and PRs: #676, #551 (the area closures label this reverses), #460 (the player row's greying, the precedent), #256 (the published wildfire outline)
- Cited in code as: #676
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the "A map overlay is never a knob at all" paragraph; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `layerCoverage.ts`, `radar.ts` and `smoke.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `LayersPopover.tsx` and `MapView.tsx` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `viewWatch.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useLayerReach.ts` and `useCapabilities.ts` bullets; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `capabilities.py` bullet
- Related: 0016 (overlays are not knobs), 0020 and 0092 (the `N/A` cells the same outlines decide), 0064 (no tooltip, no unapproved string)

## Context

The Layers menu read `Area closures (West)`, `Snow depth (US only)`, `Trail closures (OR/WA)` and `Wildfires (US only)`, with `Rain radar` and `Smoke` bare. Each parenthetical did real work: outside a feed's coverage an empty layer means "not covered", never "open" or "clear" (#551), and the label was how the reader was told. But they disagreed twice over. Three grammars said one thing (a region word, an "X only" phrase, a state list), and `West` was not true: the area feeds cover Oregon, Washington, Arizona, New Mexico, Utah, most of Nevada, southern Idaho and western Wyoming, and no California. And the wrong rows wore them: the radar mosaic and the smoke analysis both stop at an edge too, and neither row said so. The maintainer asked how to improve it (2026-10-07).

## Decision

**No label carries coverage. A bounded row greys when the map's view lies wholly outside its layer's coverage**, the way `Forecast player` greys when nothing spans time (#460). The labels are the layers' names: `Area closures`, `Trail closures`, `Wildfires`, `Snow depth`, `Rain radar`, `Smoke`.

**Wholly outside, not partly.** A view that overlaps an outline anywhere keeps its row live and the layer draws to its edge, which is honest. `boxMeetsRing` in `utils/layerCoverage.ts` tests a rectangle against an outline's outer ring exactly (a vertex inside, a corner inside, or an edge crossing), because a bounding-box test gets Colorado wrong: it sits inside the Forest Service outline's bounding box and outside the outline.

**The outlines are the server's where the server has them.** `GET /api/capabilities` publishes `coverage.wildfires`, `coverage.area_closures` and `coverage.trail_closures`, read from the same modules the overlay routes ride, so the outline a row greys on is the outline the layer's own answer carries. The radar, smoke and snow layers have no server outline; each holds a measured extent in its own pure module (`RADAR_EXTENTS`, `SMOKE_EXTENT`, `SNOW_BOUNDS`). An outline the server never sent greys nothing, which is what the menu did before the server published any.

**The view is watched only while the menu is open.** `useLayerReach` subscribes to the map's `watchBounds` when the menu opens and lets go when it closes, so a closed menu costs a pan nothing, and the answer is compared by its members so a settled move that changed no row renders none.

**A checked row that greys stays checked, with no note.** The layer draws again where it can, the link keeps carrying it, and the grey row is the whole message, for the player's reason (TJ, 2026-09-22): a sentence about a control is a tooltip by another name.

## Evidence

- Measured 2026-10-07 in Chrome at the popover's type size: the widest row was `Wildfires (US only)` at 148.9px of content and is now `Forecast player` at 130.0px, inside the 184px column either way (`MAP_COL_W` in `styles.ts`).
- The radar mosaic's reach, probed 2026-10-07 against IEM's tile cache: the tiles over Anchorage, Honolulu, San Juan and Guam each carried echoes, and the tiles over the open Pacific, Korea, Bermuda, Iceland and Europe were the same 334-byte empty image. IEM describes the composite as CONUS and states its grid as 12200 × 5400 pixels at 0.005°; the tiles paint past that grid. `docs/DATA.md` said "continental United States" and now says what was measured.
- NOAA's product page, read 2026-10-07: HMS covers "North America, Hawaii, and the Caribbean". `docs/USAGE.md` said "North America".
- The mockup the maintainer chose from (artifact `LzjH5msm2Bh9fUeuKRVkmL`): today's labels, option B (one place noun on every bounded row, `Area closures (West)` still wrong), and option A over the Cascades (all eight live), Colorado (the two closure rows grey) and the Alps (six grey, a checked `Wildfires` among them).

## Alternatives rejected

- **One grammar on every bounded row** (`Rain radar (US)`, `Smoke (US)`, `Snow depth (US)`, `Wildfires (US)`, `Trail closures (OR/WA)`). Tidier, and still wrong for the row that most needed it: no short noun names the area feeds' eight states.
- **Dropping the parentheticals and saying nothing.** Loses the one fact an empty layer cannot state for itself.
- **A note on the greyed row**, as the forecast grid's row has. The grid's note names a cause the reader can act on (an archival window); a coverage note would name a place the reader is already looking at. The player's precedent applies.
- **Greying only an unchecked row**, so a checked layer could still be switched off out of coverage. A control that looks disabled and works is a lie; the player's row is disabled either way, and panning back is the way home.
- **A bounding-box test against each outline.** Cheaper, and wrong over Colorado, which is the case the closure rows exist for.
- **A new `GET /api/coverage` route.** A second startup fetch for three static geometries the capabilities fetch can carry; `coverage` is additive on the existing contract.
- **Compiling the outlines into the browser.** A mirror of geometry nothing would pin, where the server already publishes it.

## Consequences

`GET /api/capabilities` grows by three MultiPolygon geometries (the wildfire outline alone is ~2 KB serialized); `test_capabilities.py` holds them equal to the overlay routes' own. The browser's `Capabilities` type gains `coverage`, asserted against the schema in `api-compat.ts`. `MapViewHandle` gains `watchBounds`, over `map/viewWatch.ts`. `docs/USAGE.md`, `docs/DATA.md` and `docs/API.md` describe the greying and the corrected radar and smoke domains. `LayersPopover.test.tsx` holds the eight plain labels and the greyed rows over Colorado and the Alps; `layerCoverage.test.ts` holds the geometry, the Colorado case included.
