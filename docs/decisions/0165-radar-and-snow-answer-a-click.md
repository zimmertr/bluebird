# 0165. The rain radar and the snow depth answer a click with the source's own value, on one card where both paint

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #737, 2026-10-16: ask the source where it can answer (option B), a card only where the layer painted, both readings on one card, the snow card's depth and water and the radar card's reflectivity and rate, the intensity words and their thresholds, and a failed reading handled as an overlay's failed fetch is; then, after the first build, the pointer over both, a card that opens on the click with its numbers landing after, the card's layout, the snow's words, the combined card's title and headings, and the shorter row labels
- Issues and PRs: #737, #738 (every popup is the card), #700 (one click opens one popup), #446 (the snow layer), #121 (the radar loop)
- Cited in code as: #737
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `features.ts`, `heldTileProtocol.ts`, `mapPopups.ts`, `popups.ts`, `overlays/radar.ts` and `overlays/snow.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `mapClick.ts`, `heldTiles.ts`, `pointReadout.ts`, `radar.ts`, `radarPoint.ts`, `snowPoint.ts`, `snowDepth.ts` and `popupChrome.ts` bullets; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `testSupport/heldTiles.ts` bullet; [`docs/DATA.md`](../DATA.md), Rain radar and Snow depth; [`docs/USAGE.md`](../USAGE.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0161 (every popup is the card), 0125 (map popups open on a click), 0046 (the snow layer's export and bounds), 0064 (strings need approval)

## Context

A fire, a closure and a smoke plume each open a card on a click; the rain radar and the snow depth opened nothing. Both are raster layers, so `queryRenderedFeatures` finds no feature under a click, and the click rank in `utils/mapClick.ts` had no place for them. Issue #737 laid out three options: read the rendered colour and match it to the layer's legend (A), ask the source for its value at the point (B), or leave both mute with a record saying why (C).

Measured on 2026-10-16 (the full numbers are on #737 and in `docs/DATA.md`):

- **NOAA's snow service answers `identify` at a point**: the depth in metres, the snow water equivalent in millimetres, the class it paints by and the time the analysis is valid for, in about 0.8 s, CORS open, uncached. The answer depends on the extent sent (Rainier's summit read 52.13 m with a continent and 74.58 m with a hundredth of a degree), and it sometimes fails as an ArcGIS error inside a 200 (three in about twenty, then none in thirty).
- **IEM serves no point value for the radar** (its WMS layers are `queryable="0"`), **but its tiles are lossless**: the N0Q palette gives each of the composite's 256 values its own colour, and 13,348 painted pixels over seven tiles were every one an exact palette colour, fully opaque. So the tile pixel is the radar's value to its 0.5 dBZ step.

## Decision

**Each layer answers with the source's own number.** The snow asks NOAA's `identify` with a box a hundredth of a degree wide, so it reads the 1 km cell under the click. The radar decodes the clicked pixel of the tile the frame on screen drew and reads it through the palette. Neither reads the map's canvas, which carries the layer's opacity and MapLibre's resampling.

**The app keeps a copy of every tile both layers load.** Their sources name the app's own schemes, `bluebird-radar://` and `bluebird-snow://`, and the loader behind them (`map/heldTileProtocol.ts`) fetches the real tile, keeps the bytes (`utils/heldTiles.ts`) and hands MapLibre the same bytes with their cache headers. The first build fetched the tile again at the click and the snow card waited on NOAA with nothing on screen; the maintainer found both too slow and asked for the pointer a fire gets (2026-10-16). With the tile in hand the radar's card is whole on the click, the snow's opens at once named for its band (NOAA's renders use exactly the legend's colours), and the pointer is decided on a mouse move without a request.

**A card opens only where the layer painted.** A transparent pixel opens nothing, and the click does what a click on bare map does. The pixel decides rather than NOAA's number, because the paint is what a reader sees and the two disagree at the bottom: 0.02 m came back unpainted.

**A card names the thing on its band and puts the data in its body** (2026-10-16), as every other card does: the first build titled the snow card with its depth, which the maintainer rejected. Each card ends on the fine print a fire's card ends on, `Updated: {when}`, set small and italic (`updatedLine` in `popupChrome.ts`).

**Where both paint under one click, one card carries both, the radar first.** The maintainer weighed rain always winning and the most recently enabled layer winning and chose one card, since the two describe the same spot at the same moment and neither hides the other. Its band reads `Precipitation and snow` over both sources, and each section opens on its own name in bold (`sectionHeading`), so the rain's values cannot be read as the snow's and each keeps how heavy it is. That heading is the one bold besides the title: the rule that a card carries one `<strong>` came from a bold value reading as a favourite row, which a section's name is not, so the rule now says rows never go bold. The maintainer chose this layout over a heading line that carried each source beside the name.

**They rank under every shape.** `radar` and `snow` join `MAP_TARGETS` after `smoke`, and are asked only once no shape under the click opened, never while the ring is drawn. They are point targets (`registerPoint` in `map/mapPopups.ts`): asked together, an answer the next click made stale is dropped, and closing the card aborts what it was still waiting on.

**The copy** (approved 2026-10-16): the radar's name is `Weak radar echo` under 15 dBZ and `Light`, `Moderate`, `Heavy` or `Very heavy precipitation` from 15, 30, 40 and 50 dBZ, its source `NEXRAD radar`, its rows `Rate: about {r} in/h` from 15 dBZ, which reads `Rate: ≥{r} in/h` from the hail cap up, a bound marked the way the cloud deck marks its ceiling, and then `Reflectivity`, the rate first because it is what a reader came to ask (the maintainer, 2026-10-16), then `Updated: now` or `Updated: {n} min ago` for the frame on screen. The snow's name is `Light snow` under 3.9 in, then `Moderate`, `Deep` and `Very deep snow` from 3.9, 20 and 59 in and `Permanent snow` from 197 in, NOAA's own band edges; its source `NOAA snow analysis`; its rows `Depth` and `Snow water equivalent`, then `Updated: {date}, {time}`. `Rate` and `Depth` were `Rain rate` and `Snow depth` until the maintainer cut them: the name above already says which, and `Rate` claims less than `Rain rate`, which suits a rate the radar cannot tell rain from snow under. The maintainer offered `Permanent`, `Glacier ice` or `Ice` for the top band's word; `Permanent snow` was Claude's pick among them, since the top band is a depth rather than a material. The radar's time stays relative: IEM publishes each frame's time, but a tile can sit in its edge cache for five minutes, so a time asked for at the click could be a frame off the picture.

**The rate is Marshall and Palmer's Z = 200 R^1.6, read no higher than 53 dBZ**, the NEXRAD rainfall algorithm's hail cap. The cap was added after the maintainer's approval of the rate, once the strongest cell measured (59 dBZ over Wilkes-Barre) read 7.0 in/h without it; it changes the number, and a rate it holds says so with its `≥`.

**A failed reading keeps its card.** The snow's card is already open when NOAA fails, so it keeps its name and says `NOAA snow analysis failed. Try again later.` in place of the numbers, and the failure is warned in the console as every overlay's failed fetch is (`map/overlays/recovery.ts`). A snow answer that is ArcGIS's error inside a 200 is asked once more first. A tile that fails to load paints nothing, so no card can open on it.

## Alternatives rejected

- **Reading the rendered colour (option A).** For the radar it is strictly worse than decoding the tile, which reads the same colour before the layer's opacity and MapLibre's resampling blend it. For the snow it costs the same request as asking NOAA, since NOAA's renders are uncached, and answers a band rather than a number.
- **NOAA's MRMS reflectivity ImageServer for the radar.** It answers `identify` with CORS, but it is a different product from the IEM mosaic the map draws, so the card could disagree with the picture under the click.
- **No card for either (option C).** Two of the six overlays would have stayed mute while the other four explain themselves.

## Consequences

A click on painted snow costs NOAA one `identify`, and the reader sees its card on the click and its numbers about 0.8 s later. A click on an echo, and the pointer over either layer, cost nothing upstream, because the pixel comes from a tile the app already holds. Holding them costs memory, bounded at 600 tiles and eight decoded at once, and a layer switched off drops its own. The bundle grew from 730,960 to 735,509 gzipped bytes. If IEM ever changes the N0Q palette, no pixel matches and no radar card opens: the reading can stop answering, never answer wrong. The rate is an estimate that assumes rain, and `docs/DATA.md` says what reflectivity cannot know.
