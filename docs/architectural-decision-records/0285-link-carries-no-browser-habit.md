# 0285. A share link carries no browser habit, names a ready-made list, and keeps the camera's angle

- Status: Accepted. Amends [0016](0016-overlays-not-knobs.md) (the forecast player's switch is kept in the browser, not the link), [0250](0250-layers-palette-and-base-map-opacity.md) (so are the four opacity levels), [0255](0255-chart-metrics-as-panels.md) (so is the panels' layout), [0065](0065-link-carries-camera-removals-order.md) (the camera carries its bearing and pitch) and [0263](0263-coordinate-search-loads-preset-lists.md) (a link names a picked list)
- Date: 2026-11-04
- Decider: the maintainer (TJ), on issue #864, 2026-11-04. The choices under "The implementer's" below were made in the pull request, for review there.
- Issues and PRs: #864, #292, #848
- Cited in code as: #864
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "A map overlay is never a knob at all"; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `urlParams.ts`, `urlState.ts`, `viewPrefs.ts`, `mapView.ts` and `presetLists.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useLinkedList.ts`, `useMapOverlays.ts` and `useChartMetrics.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `camera.ts` and `terrain.ts` bullets; [`docs/USAGE.md`](../USAGE.md), the share-link paragraphs

## Context

`viewPrefs.ts` draws the line between the two places a setting can live: a link is the session someone shares, and the browser's storage holds one browser's habits. An audit of the link on 2026-11-04, at `bcd2c77`, found it on the wrong side of that line in three places and short in three more. The link had grown from 43 parameters when the first audit (#292) closed to 61.

- `layout`, `player` and the four `*opacity` keys were habits. A phone always stacks the chart's panels, so `layout` did nothing there. The player's default is the device's, so `player=1` put a desk reader's bar on a phone, where it covers a third of a short map. How faded a layer draws is taste, like the theme, which never rode a link.
- A list picked from the Coordinate list field rode the link as its whole text, compressed. The four lists then shipped compressed to between 2,492 and 2,589 characters each (measured 2026-11-04 with the repo's lz-string).
- The writer never checked `MAX_CUSTOMZ_CHARS`, which only the reader enforced. At about 23 compressed characters a row (measured the same day on those four lists), the cap falls near 700 rows and the analysis allows 1,500. A list between the two reached the address bar, and a reload dropped it.
- `view` held the centre and the zoom. A link made in 3D opened at the 3D button's own tilt, facing north.
- `cloud_deck` was the one key with an underscore, beside `minclouddeck`. `snow` was the snow depth layer, beside `snowfall`. `fires` was the wildfire layer.

## Decision

The maintainer settled all of it on 2026-11-04, and waived backward compatibility for this change alone: no code reads an old key, and an old link that breaks is acceptable. The app was at v0.134, before the share-link promise in `docs/API.md` starts at 1.0.

- **The link carries no habit.** The chart's panel layout, the forecast player's switch and the four base-map opacity levels leave the link and are kept under `bluebird_forecast_view`, beside the columns and the legend's fold. The base-map switches stay in the link: slope angle over a couloir is what someone shares.
- **A ready-made list travels by name**, as `list=` and the list's `id` in the manifest (record 0281), while the box holds exactly that list. An edit to the box makes the rows the reader's own, and `customz` carries them. An `id` the build does not ship is said with the line a `customz` that could not be read gets.
- **The app writes no link it cannot read back.** A pasted list whose compressed text is over `MAX_CUSTOMZ_CHARS` is left out of the link, and the Analyze button's messages say `This list is too long to share in a link.`
- **The camera keeps its angle**: `view=lng,lat,zoom,bearing,pitch`, both angles in whole degrees, and both written only when either is not zero. A link's pitch wins over the tilt the 3D button gives a flat map.
- **Three keys take their neighbours' spelling**: `cloud_deck` becomes `clouddeck`, `snow` becomes `snowdepth`, and `fires` becomes `wildfires`. `fireactivity` keeps its name.

### The implementer's

The issue left these open, and the pull request decided them.

- The list's rows are not in the link, so the page fetches them after it opens (`useLinkedList`). Until they land, the address bar goes on naming the list, and a link's run on open (`analyze=1`) waits. A fetch that fails says the line a failed pick says, `The list could not load. Try again later.`, and the link keeps the name so a reload asks again. Rows typed before the list lands are kept.
- A link's list frames the map as a picked one does, unless the link names a camera.
- A link that carries both `customz` and `list` keeps the rows it spelled out. The app writes no such link.
- The long-list line is an info line, beside the lines about what a link lost. It does not open the list.
- An opacity level is stored only once a slider is off its start, so a browser that never touched one keeps nothing.
- A link's pitch is held to the map's own steepest tilt, 60 degrees, and its bearing to a half turn either way. A turn and a tilt that both round to zero write three fields.
- "A link's pitch wins" covers a pitch of zero. A link made in 3D from straight above opens in 3D from straight above. The next press of the 3D button tilts a flat map as before.

## Evidence

The measurements are in Context, each with its date. `urlParams.test.ts` holds the table to 56 keys in the order a link writes them and fails a key that is not lower-case letters and digits.

## Alternatives rejected

- **Keep the long list in `sessionStorage` as well**, so the sender's own reload loses nothing (option B of the issue). Two places would hold the list, and they would have to agree on which wins when a link also carries one.
- **Raise `MAX_CUSTOMZ_CHARS` to cover 1,500 rows** (option C). About 35 KB of query, past the edge's URL limit as #622 states it, so the link would fail at Cloudflare and not in the app.
- **Read the old keys as aliases.** The maintainer waived it. Every alias is a row the table carries for good.
- **Check a `list=` id's shape in the table and its membership in the hook**, the way `model` is handled. The lists are compiled into the build, where the models are the deployment's, so the row can answer for itself.

## Consequences

A link made before this change loses `layout`, `player` and the opacity levels without a word, and opens with the wildfire or snow depth layer off, or a cloud deck aggregate at its default, where it named one by the old key.

A link opened in another browser shows that browser's player, layout and opacity levels. `legal.test.ts` holds the privacy page's account of what the browser keeps to the keys that are written.

A reader whose pasted list is too long for a link still loses it on their own reload. The message says so before they send the link.

Row order in `URL_PARAMS` is part of a link's text. `list` sits after `customz`, so the reader has already seen whether the link spelled its rows out.
