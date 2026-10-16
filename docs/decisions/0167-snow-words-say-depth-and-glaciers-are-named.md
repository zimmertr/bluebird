# 0167. The snow card's words say only how deep, and a glacier is named `Glacier`

- Status: Accepted. Supersedes 0165 in part: the snow's top word.
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #748, 2026-10-16: drop `Permanent snow`, name a glacier `Glacier`, keep NOAA's numbers on it, and stand a bar in the title until the glacier answer is in
- Issues and PRs: #748, #749, #737 (the cards), #446 (the snow layer)
- Cited in code as: #748
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `glacierCell.ts` and `snowPoint.ts` bullets; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `testSupport/mvt.ts` bullet; [`docs/DATA.md`](../DATA.md), Snow depth; [`docs/USAGE.md`](../USAGE.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0165 (the cards), 0046 (the snow layer's export and bounds)

## Context

0165 named the snow by NOAA's band edges, and the top band, 197 in and over, `Permanent snow`, on the reading that past that depth the analysis is mostly glacier the model never melts out. The maintainer asked about Mount Baker Ski Area's 1,140 in season of 1998 to 1999: a record winter's snowpack can pass 197 in where nothing is permanent, so the word claimed what the depth cannot know.

NOAA's number on a glacier is not ice either. The analysis has no glacier in it, so where snow never melts out its depth keeps building: Rainier's summit read 68.62 m in September and Baker's 67.61 m in October. Baker's summit read 834 in of depth over 499 in of water on 2026-10-16, a density of 0.60, which is firn's; ice is about 0.9.

## Decision

**The words say how deep and nothing more**: `Light snow` under 3.9 in, `Moderate snow` from 3.9, `Deep snow` from 20 and `Very deep snow` from 59 in up.

**A cell on a glacier is titled `Glacier`, and keeps NOAA's numbers.** The test is whether the analysis cell under the click, a box of 1/120 of a degree around it, overlaps a glacier OpenStreetMap has mapped (`utils/glacierCell.ts`), read from the basemap's `landcover` class `ice` at zoom 12 whatever the map shows. The cell rather than the point, because NOAA's number is the cell's, and one zoom rather than the map's drawing, because that drawing changes with zoom and OSM leaves Baker's summit dome out of its outlines: a point test on the map read the summit as bare ground from zoom 9 up. Measured 2026-10-16, the cell test read Baker's, Rainier's and Hood's summits, the cell west of Baker's and Camp Muir as glacier, and Paradise, Mount Baker Ski Area and Timberline Lodge as not, the same at every zoom from 10 to 14. `Glacier` over `Glacier ice`, which the maintainer first chose, because the numbers have firn's density and not ice's, so the title names the place and claims nothing about the material. The numbers stay rather than `N/A`, as the maintainer asked: they are what the source says, and the title tells a reader where they stand.

**A cell not yet known to be on a glacier opens with a bar for its name.** The glacier tile took 400 to 770 ms to arrive, about as long as NOAA's answer, so waiting for it would undo the card that opens on the click. Opening under the depth word and changing it to `Glacier` a moment later was built first and rejected by the maintainer; the bar fills with the right name when the numbers land, and a second click nearby, whose tiles are held, is named at once.

**A value NOAA leaves out reads `N/A`** rather than dropping its row, so every snow card has the same lines, as every radar card does (0166).

## Alternatives rejected

- **`Permanent snow`.** Wrong in a record winter.
- **`Extreme snow` for the top band.** Kept a fifth word for a band the colour cannot tell from glacier.
- **Testing the point against the map's own glacier fill.** Zoom-dependent, and blind to Baker's summit.
- **`N/A` for a glacier's depth and water.** Dropped the source's own numbers.
- **`Glacier ice/snow`.** No title in the app hedges with a slash.

## Consequences

A click within about half a kilometre of a mapped glacier reads as one, which is deliberate: NOAA's number for that cell already carries the glacier's ground. Where OSM has mapped no glacier, the card keeps its depth word and NOAA's number. The first snow click in an area costs one to four zoom-12 basemap tiles from `tiles.openfreemap.org`, the same host and tiles the map is drawn from.
