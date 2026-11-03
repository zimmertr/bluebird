# 0262. The map's corner credits the basemap's three providers in each one's own words, parted like the rest of the line

- Status: Accepted
- Date: 2026-11-03
- Decider: the maintainer (TJ), on PR #845, reviewing the corner beside the always-on Mapterhorn credit record 0253 added
- Issues and PRs: #832, PR #845
- Cited in code as: TJ, 2026-11-03
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/basemapCredit.ts` bullet; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `basemapWatch.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `MapView.tsx`; [`NOTICES.md`](../../NOTICES.md), OpenFreeMap; [`DATA.md`](../DATA.md), Map tiles; [`STYLES.md`](../STYLES.md), the map's corner

## Context

The corner's credit line is MapLibre's attribution control, which joins each source's attribution string to the next with a pipe. The app's own sources say `MapLibre`, `Open-Meteo.com` and, since record 0253, `© Mapterhorn`. OpenFreeMap's style declares one string for its one source, `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`, so the line read five credits parted by pipes and then three run together, with a copyright mark on two of the six and a sentence in the middle.

The maintainer asked three things of it on 2026-11-03: why the marks on Mapterhorn and OpenMapTiles alone, why no pipe between OpenFreeMap and OpenMapTiles, and why `OpenMapTiles Data from OpenStreetMap` rather than the names. And a press on the banner dragged the map where a press on its text selected it.

## Decision

- **The style's credit is rewritten as it loads**, into three credits parted the way the control parts every other: `OpenFreeMap | © OpenMapTiles | © OpenStreetMap contributors`. The whole line reads `MapLibre | Open-Meteo.com | © Mapterhorn | OpenFreeMap | © OpenMapTiles | © OpenStreetMap contributors`.
- **Each credit says what its provider asks for and no more.** OpenMapTiles asks that `© OpenMapTiles` be shown; OpenStreetMap's guideline is `© OpenStreetMap contributors`, linked to its copyright page; Mapterhorn asks for `© Mapterhorn`; OpenFreeMap asks for a credit and names no mark; MapLibre and Open-Meteo name none. So the marks stand where a licence asks for one and nowhere else, which is the answer to why some credits carry one: a credit is the provider's sentence, not the app's.
- **The rewrite is `setStyle`'s `transformStyle`** (`utils/basemapCredit.ts`), applied to every load of the style: the first, which `MapView` makes through `setStyle` rather than the constructor because only `setStyle` takes the option, and the reload `basemapWatch.ts` asks for after a failure. Nothing else in the style changes, and a style with no OpenFreeMap source comes back untouched.
- **The credit box takes its own presses.** `MAP_CORNER.credit` is `pointer-events-auto` where the column of buttons above it yields its gaps to the map, because a reader sees one banner and expects to select its text wherever they press it.

## Evidence

Read 2026-11-03 off the Liberty style's source: `<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>`. MapLibre's `AttributionControl` joins source attributions with ` | ` and shows each string as given.

On production the same day, a press on the credit box's padding or in the gap beside the scale dragged the map, and the box's computed `pointer-events` was `none`, inherited from `MAP_CORNER.box`; the `<details>` control inside it was `auto`, which is why its text could be selected.

## Alternatives rejected

- The six names bare, `Mapterhorn | OpenFreeMap | OpenMapTiles | OpenStreetMap` (the maintainer's sketch): OpenMapTiles, OpenStreetMap and Mapterhorn each ask for the mark, and the app does not shorten a licence's sentence.
- Marks on every credit: MapLibre, Open-Meteo and OpenFreeMap ask for none, and a mark they did not ask for is the app's invention.
- Leaving the style's string and patching the control's text after it renders: the control rebuilds its text on every source change, so the patch would race every overlay toggle.
- A second PR for the credit: folded into #845, which is the PR that put a credit beside it (the maintainer, 2026-11-03).

## Consequences

`MapView` constructs the map with no `style` and asks for it with `map.setStyle(STYLE, BASEMAP_STYLE_OPTIONS)` right after the basemap watch is registered, so a style that fails is still heard. `basemapWatch.test.ts` pins the reload's options, and `basemapCredit.test.ts` the rewrite and the words.

`NOTICES.md` and `DATA.md` say the corner's words rather than deferring to the tile metadata.
