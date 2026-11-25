# 0348. A map style that failed is asked for again on a timer, and past two retries the map falls back for the visit

- Status: Approved by the maintainer on 2026-11-25; accepted when the reliability PR merges. Amends #580's recovery of the basemap
- Date: 2026-11-25
- Decider: proposed by the reliability plan's mitigation 9 (`docs/RELIABILITY.md`); the fallback for the visit chosen by the maintainer on PR #1001, 2026-11-25
- Issues and PRs: #1001; #580
- Cited in code as: record 0348
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `basemapWatch.ts` bullet

## Context

Since #580 a basemap style that fails to load says `The map could not load. Try again later.` and is asked for again on the browser's `online` event. On a steady connection that event never fires, so a style host that failed for a few seconds left the map blank, the ring tool and every marker with it, until the reader reloaded the page.

## Decision

The style is asked for again on its own after 5, 15, 30 and then every 60 seconds while it keeps failing, and the timer stops when it loads or the map goes away. A reconnect still asks at once, which is why the timer is the watcher's own rather than the overlays' timed recovery, which holds a reconnect until its wait runs out.

Past its first two retries, about 20 s after the first failure, the map stops asking and takes a fallback style for the rest of the visit: Liberty's ground and no layers, with OpenFreeMap's glyphs. `load` then fires, so the ring tool, the markers and the base maps from other hosts (USGS and EOX) mount and an analysis can be drawn and run. The failure stays in the messages, because a reload is what brings Liberty back. The maintainer chose this on 2026-11-25 over swapping Liberty back in live, which would replace the style under every layer the app had added since.

## Not built

A bundled copy of Liberty in place of the live one. On 2026-11-25 OpenFreeMap's live style pointed its vector source at `https://tiles.openfreemap.org/backup_planet`: the style is the switch it fails over with, and a copy would freeze it. The licences would have allowed a copy (read that day from the `openfreemap-styles` repository's `LICENSE.md`: the style is MIT, derived from OSM Liberty and OSM Bright under BSD 3-Clause code and CC BY 4.0 design, the Maki sprites CC0 and the Noto Sans glyphs under the SIL Open Font License), and the fallback holds none of that work, so it carries no new notice.
