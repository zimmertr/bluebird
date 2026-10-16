# 0165. The rain radar and the snow depth answer a click with the source's own value, on one card where both paint

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #737, 2026-10-16: ask the source where it can answer (option B), a card only where the layer painted, both readings on one card, the snow card's depth and water and the radar card's reflectivity and rate, the intensity words and their thresholds, and a failed reading handled as an overlay's failed fetch is
- Issues and PRs: #737, #738 (every popup is the card), #700 (one click opens one popup), #446 (the snow layer), #121 (the radar loop)
- Cited in code as: #737
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts`, `popups.ts`, `overlays/radar.ts` and `overlays/snow.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `mapClick.ts`, `pointReadout.ts`, `radarPoint.ts`, `snowPoint.ts`, `snowDepth.ts` and `popupChrome.ts` bullets; [`docs/DATA.md`](../DATA.md), Rain radar and Snow depth; [`docs/USAGE.md`](../USAGE.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0161 (every popup is the card), 0125 (map popups open on a click), 0046 (the snow layer's export and bounds), 0064 (strings need approval)

## Context

A fire, a closure and a smoke plume each open a card on a click; the rain radar and the snow depth opened nothing. Both are raster layers, so `queryRenderedFeatures` finds no feature under a click, and the click rank in `utils/mapClick.ts` had no place for them. Issue #737 laid out three options: read the rendered colour and match it to the layer's legend (A), ask the source for its value at the point (B), or leave both mute with a record saying why (C).

Measured on 2026-10-16 (the full numbers are on #737 and in `docs/DATA.md`):

- **NOAA's snow service answers `identify` at a point**: the depth in metres, the snow water equivalent in millimetres, the class it paints by and the time the analysis is valid for, in about 0.8 s, CORS open, uncached. The answer depends on the extent sent (Rainier's summit read 52.13 m with a continent and 74.58 m with a hundredth of a degree), and it sometimes fails as an ArcGIS error inside a 200 (three in about twenty, then none in thirty).
- **IEM serves no point value for the radar** (its WMS layers are `queryable="0"`), **but its tiles are lossless**: the N0Q palette gives each of the composite's 256 values its own colour, and 13,348 painted pixels over seven tiles were every one an exact palette colour, fully opaque. So the tile pixel is the radar's value to its 0.5 dBZ step.

## Decision

**Each layer answers with the source's own number.** The snow asks NOAA's `identify` with a box a hundredth of a degree wide, so it reads the 1 km cell under the click. The radar decodes the clicked pixel of the tile the frame on screen drew, the same URL MapLibre loaded at the zoom it loads a 256 px raster at, and reads it through the palette. Neither reads the map's canvas, which carries the layer's opacity and MapLibre's resampling.

**A card opens only where the layer painted.** A transparent radar pixel, or a snow cell in NOAA's class 0, opens nothing, and the click does what a click on bare map does. NOAA's class decides rather than the number, because the class is what the layer paints by and the two disagree at the bottom: 0.02 m came back unpainted.

**Where both paint under one click, one card carries both, the radar first.** The maintainer weighed rain always winning and the most recently enabled layer winning and chose one card, since the two describe the same spot at the same moment and neither hides the other. The radar's name is the card's; the snow is a section of the body ruled off below it, with its own name and source line (`bodySection` in `popupChrome.ts`).

**They rank under every shape.** `radar` and `snow` join `MAP_TARGETS` after `smoke`, and are asked only once no shape under the click opened, never while the ring is drawn. They are point targets (`registerPoint` in `map/mapPopups.ts`): asked together, an answer the next click made stale is dropped, and the cursor does not change over them, because asking a picture what it painted is a fetch and the cursor is decided on every move.

**The copy** (approved 2026-10-16): the radar's name is `Weak radar echo` under 15 dBZ and `Light`, `Moderate`, `Heavy` or `Very heavy precipitation` from 15, 30, 40 and 50 dBZ; its source line `NEXRAD radar, now` or `NEXRAD radar, {n} min ago` for the frame on screen; its rows `Reflectivity` and, from 15 dBZ, `Rain rate: about {r} in/h`. The snow's name is `{depth} of snow`, its source line `NOAA snow analysis, {time}`, its row `Snow water equivalent`.

**The rain rate is Marshall and Palmer's Z = 200 R^1.6, read no higher than 53 dBZ**, the NEXRAD rainfall algorithm's hail cap. The cap was added after the maintainer's approval of the rate, once the strongest cell measured (59 dBZ over Wilkes-Barre) read 7.0 in/h without it; it changes the number, not the copy.

**A failed reading opens nothing and warns in the console**, as every overlay's failed fetch does (`map/overlays/recovery.ts`). A snow answer that is ArcGIS's error inside a 200 is asked once more first. There is no retry beyond that: the reader's next click is the next attempt.

## Alternatives rejected

- **Reading the rendered colour (option A).** For the radar it is strictly worse than decoding the tile, which reads the same colour before the layer's opacity and MapLibre's resampling blend it. For the snow it costs the same request as asking NOAA, since NOAA's renders are uncached, and answers a band rather than a number.
- **NOAA's MRMS reflectivity ImageServer for the radar.** It answers `identify` with CORS, but it is a different product from the IEM mosaic the map draws, so the card could disagree with the picture under the click.
- **No card for either (option C).** Two of the six overlays would have stayed mute while the other four explain themselves.

## Consequences

A click on painted snow costs NOAA one `identify` and the reader about 0.8 s before the card appears, with nothing on screen in between. A click on an echo costs nothing upstream when the browser still holds the tile; whether it did cannot be measured in the page, because IEM sends no `Timing-Allow-Origin`. If IEM ever changes the N0Q palette, no pixel matches and no radar card opens: the reading can stop answering, never answer wrong. The rate is an estimate that assumes rain, and `docs/DATA.md` says what reflectivity cannot know.
