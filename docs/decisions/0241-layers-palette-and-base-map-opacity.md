# 0241. The Layers menu is a layers palette: an eye on every row, and an opacity slider on the four Base map rows, the imagery over the ground

- Status: Accepted. Amends 0233 (the imagery draws over Liberty's ground at a level, rather than under it with the ground faded out) and 0240 (the groups stand; each row's checkbox is drawn as an eye).
- Date: 2026-10-29
- Decider: the maintainer (TJ), on #799, 2026-10-29: an opacity control on Satellite, Topographic, Shaded relief and Slope angle, 0 to 100, default 50, with Satellite drawn over the map so the map shows through as the level falls, and option 6 of the opacity lab, the layers palette, with no slider on the Hazards and Forecast rows and the phone sheet stepping aside while a slider is dragged. That labels, trails, roads and the markers stay over every base-map layer, and only the ground goes under the blend, he confirmed. The link's grammar, how the relief and the contours read a level, the buildings, the slider's width, its look while off and the eye's off ink were the implementer's, for review on the pull request.
- Issues and PRs: #799, #823
- Cited in code as: record 0241
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MapLegend.tsx`/`LayersPopover.tsx` bullet and `BottomSheet.tsx`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `overlays/imagery.ts`, `terrain.ts`, `features.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `baseMapOpacity.ts`, `urlParams.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useMapOverlays.ts`; [`docs/STYLES.md`](../STYLES.md), `LAYER_ROW` and `SHEET_ASIDE`; [`docs/USAGE.md`](../USAGE.md), Map layers; [`docs/DATA.md`](../DATA.md), Elevation and imagery
- Related: 0016 (overlays are not knobs), 0209 and 0227 (Shift ranges), 0234 (the map's marks on a dark ground), 0239 (slope angle at half strength)

## Context

The four ground layers drew at one strength each: the imagery whole, with Liberty's land, water and buildings faded to nothing under it; the relief and the contours at a look tuned by eye; the slope bands at half. A reader planning a line wants the photos faint enough to read the map through them, or the bands strong over pale snow, and had no way to ask. The maintainer asked for an opacity control on all four, default 50%, and for the imagery to draw over the map so the map shows through as the level falls. A lab drew ten places for the control; he chose the layers palette.

## Decision

- **Every row is an eye**, open while its layer is on and struck while it is off, the name in the soft ink while off. Under each eye stands the row's own native checkbox, drawn by the glyph (`appearance-none`), so a screen reader, Testing Library, the tutorial and a Shift range across all thirteen rows read a checkbox as before. The glyphs are `IconEye` and `IconEyeOff`.
- **Each Base map row carries an opacity slider at its right**, the menu's own `SLIDER` well with the level at the left and `Opacity` at the right, 0 to 100 in steps of 5, 50 to start. The Hazards and Forecast rows carry none. The forecast grid's Blocks/Smooth segment and Coverage slider stay under its row as they were.
- **While its layer is off a slider keeps its level** and wears a fill without the accent, and a drag on it switches the layer on at the level it sets. Switching the layer on by its eye brings the level back.
- **On a phone the Layers sheet steps aside while a finger drags a slider**: the dim lifts, the card and every other row go, and the dragged row stays where it stood on the sheet's fill, edge and shadow, so the map being tuned is in sight. On release it all comes back. The keyboard moves a level a step at a time and keeps the sheet.
- **A level is presentation**, held in `useMapOverlays` beside the switches: no fetch, no `commitNeeded` cue, nothing in the report moves (record 0016).
- **The link** keeps `satellite`, `topo`, `relief` and `slope` as they were, so every old link opens as before. A level rides as its own parameter, the layer's flag and the word, a whole percent: `satelliteopacity=80`, `topoopacity=30`, `reliefopacity=100`, `slopeopacity=0`. Each is written only while its row is on and its level is not 50, sits right after its flag, and is read only beside that flag, held to 0 to 100. The parameters are additive to the 1.0 share-link promise.
- **Satellite draws over the ground.** The two rasters go directly above the last of Liberty's ground layers under its first road, symbol or layer of anybody else's (in Liberty, over `aeroway_fill` and under `aeroway_runway`), with `raster-opacity` at the level and both at the same level, so where USGS answers it still covers EOX. The land and water fills are no longer faded: they are what shows through. At 100% the photos hide the ground; at 0% the layers hide and Liberty shows whole, and nothing is fetched. Liberty draws its buildings over its roads, where the imagery cannot go under them without going over the roads, so a ground layer above the imagery fades to its own opacity times one less the level, which reads the same. The park outline and the river lines, which stand among the fills, go under the photos with them.
- **The contours** scale their lines' and their heights' opacity with the level: each line at its ink's own opacity times the level over 50, held to 1, the edge the same, and the heights whole from 50 up and fading under it. `overImagery` still chooses the ink, now from 50% of the imagery up, where the photos are the ground that shows most.
- **The relief** has no opacity of its own in MapLibre, so the level moves what it has. At 50 it is the look tuned on 2026-10-27 (`standard`, 0.3 of exaggeration, the brown shadow whole, the light at 0.45). Under 50 the shadow's and the light's alpha fall together and the depth holds, so the shading pales evenly to nothing at 0, rather than flattening while it fades, which scaling both would do. Over 50 the shadow is whole already, so the depth and the light grow, to 0.6 and 0.9 at 100, twice the default.
- **The slope bands** paint whole in the tile already (record 0239), so the level is the raster's opacity: 50 is the half strength they drew at, pixel for pixel.
- **The legend draws the slope bands at full strength**, not at the level. The card is not the ground the bands land on, so a ramp at half over the card matches the map no better than a whole one, and at low levels it would key nothing. It keys which colour means which band.
- **At 0 every base-map layer hides** as if switched off, so it asks for no tile, and comes back at the level it is given.

## Evidence

Measured 2026-10-29 in the Playwright 1.64.1 image's Chromium on the built page.

- **The menu at a desk (1389x868)** is 246.7px wide, every row 28px, a heading 18px; the lab's estimate was about 270. **The sheet on a phone (390x844)** keeps its 33px rows with the rule and stands 564px tall from 280px down, so the tutorial's Layers card, whose foot is at 262px, clears it by 18px.
- **The slider's line**: `100%` is 30.7px and `Opacity` 44px semibold. At the lab's 96px the thumb at 50% covered the wordmark's first letter; at 120 it stands clear by 6px, and `100%` and `Opacity` leave 29px between them.
- **The eye's inks** (`styles.test.ts`): open, the middle ink, 9.83:1 dark and 12.3:1 light on the card; struck, the soft ink, 3.94:1 dark and 7.47:1 light on the raised hover fill, the lowest ground it stands on. The lab's faint ink read under 3:1 there in dark.
- **The resting fill**: the control ink on the raised fill, 8.4:1 dark and 13.66:1 light. The lab's 55% fade would have left the white value on the accent under 4.5:1 in both themes.
- **The water fill under the imagery at 100%** still answers `queryRenderedFeatures` (`layerOpacity.spec.ts`), so a clicked lake keeps its outline.
- **A drag** sets both rasters' `raster-opacity`, the slope's and the relief's paint, read back off the map with `getPaintProperty` at a desk and on a phone (`layerOpacity.spec.ts`).

## Alternatives rejected

- The lab's other nine placements: a slider under each row, the slider as the switch, one group slider, a readout chip, the slider in the legend, a base-map mixer, a ring on the swatch, stepper dots, and a row that fills. The maintainer chose the palette.
- **A greyed slider on the Hazards and Forecast rows**, the lab's other setting: not chosen.
- **The imagery under the ground with the fills faded by one less the level**, which keeps record 0233's order: where Liberty draws no fill the photos would show whole at any level, so 0% would not be Liberty.
- **The imagery under Liberty's first line layer**, the brief's first reading: in Liberty that is the park outline, the fourth layer, under the woods, the water and every other fill.
- **The slider faded to 55% while off**, as the lab drew it: its value would read under AA, and it is a slider that still works.
- **One link parameter for all four**, `opacity=satellite:80,slope:30`: shorter, but it reads as one setting, and a level per layer by the layer's own flag is the shape every other overlay parameter has.

## Consequences

`LayersPopover.test.tsx` holds the eyes, the four sliders and none elsewhere, the resting fill, a drag switching an off layer on, a Shift range from the base map into the hazards, and the sheet stepping aside. `imagery.test.ts` holds the new place in Liberty's stack, the fade of the buildings, the ground under the photos left alone and the layers hidden at 0; `terrain.test.ts` the relief's paint at 0, 25, 50 and 100 and the contours' and the slope's levels; `urlState.test.ts` and `urlParams.test.ts` the parameters; `styles.test.ts` every ratio above. The browser suite's `layerOpacity.spec.ts` reads the map's paint back after a drag, reaching the map through a setter on Object's prototype that MapLibre's constructor calls, so the app carries no hook for it. The menu is about 118px wider at a desk than it was. A ground layer Liberty draws over its roads that wears an expression for its opacity shows whole at 0 and goes at any other level, since an expression cannot be scaled without unpicking it; Liberty's buildings wear numbers.
