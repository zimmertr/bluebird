# 0348. A map style that failed is asked for again on a timer, not only on a reconnect

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it. Amends #580's recovery of the basemap
- Date: 2026-11-25
- Decider: proposed by the reliability plan's mitigation 9 (`docs/RELIABILITY.md`), for the maintainer (TJ)
- Issues and PRs: #1001; #580
- Cited in code as: record 0348
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `basemapWatch.ts` bullet

## Context

Since #580 a basemap style that fails to load says `The map could not load. Try again later.` and is asked for again on the browser's `online` event. On a steady connection that event never fires, so a style host that failed for a few seconds left the map blank, the ring tool and every marker with it, until the reader reloaded the page.

## Decision

The style is asked for again on its own after 5, 15, 30 and then every 60 seconds while it keeps failing, and the timer stops when it loads or the map goes away. A reconnect still asks at once, which is why the timer is the watcher's own rather than the overlays' timed recovery, which holds a reconnect until its wait runs out.

## Not built

The plan also bundles the style, its glyphs and its sprites in the app's assets, so the map's tools mount with the tile host down. That commits OpenFreeMap's Liberty style to the repository. Its terms allow that, read on 2026-11-25 from the `openfreemap-styles` repository's `LICENSE.md`: the style is MIT, derived from OSM Liberty and OSM Bright under BSD 3-Clause code and CC BY 4.0 design, the Maki sprites are CC0 and the Noto Sans glyphs are under the SIL Open Font License, so a bundled copy carries those notices in `NOTICES.md` beside the attribution the map already shows. Swapping a bundled style for the live one after the overlays have mounted also needs checking in a browser, since `setStyle` drops the app's own layers. Logged for the maintainer.
