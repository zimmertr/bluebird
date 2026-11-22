# 0310. The cloud sea is drawn on the ground from the deck the report already holds

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-18
- Decider: the maintainer, 2026-11-17 ("From fetched destinations")
- Issues and PRs: #825
- Cited in code as: record 0310
- Guide: `frontend/src/utils/CLAUDE.md` (`cloudSea.ts`), `frontend/src/map/CLAUDE.md` (`cloudSea.ts`)

## Context

The prototype painted a marine layer in the valleys with the summits standing clear above it, which says at a glance where a day is above the cloud. Its weather was invented. The maintainer chose to draw it from the forecasts the report already fetched rather than from a new request.

## Decision

Every destination's hourly series carries the cloud deck's base and, since record 0335, the top of its layer. At the hour the forecast player stands on, or the window's middle hour while it is off, the base and top are interpolated between destinations by inverse squared distance within 30 km, among the destinations in cloud alone, and the share of the nearby weight in cloud fades the deck's edge. Each pixel of a tile is then painted by where the ground stands against the deck there: inside it a slate fog, under it a light veil, above its top nothing, each edge faded over 350 ft. One colour serves both themes, because the basemap is pale under either. The ground is the elevation tile the relief and the slope read, at zoom 12 and out; the deck is kilometres between samples, so finer ground would sharpen an edge the data does not have. The layer stands in a slot of its own over the trails and under every overlay, label and marker.

A tile no destination is within reach of asks for no elevation, so the layer fetches only the ground under the field. It is drawn while a report holds a field. Its Layers row, **Cloud deck** in the Forecast group after **Snow depth**, the metric's own name, greys until a report is held and is on until the reader turns it off, the one row that is, because it fetches nothing and draws only over a report. A link names it only when it is off, `nocloud=1`, so every link written before it opens with the deck drawn. Both are a desk's for now: a phone draws no cloud sea, and its Layers sheet has no room for a fourteenth row under the tour's card (the browser suite's phone tour, 2026-11-18), so the phone's shell decides both. The rule that every row stands in the list every time (`style-layer-rows`) allows this one spread, on `sheet`, because it follows the device rather than anything the reader switches.

## Evidence

- `utils/cloudSea.test.ts` pins the interpolation, the alpha at every edge, a tile's reach test and a painted tile.

## Open

- The row's wording, `Cloud deck`, and its link key, `nocloud`, are proposed here and wait on the maintainer's approval.
- Playback repaints every tile in view each hour. Measured 2026-11-18 in the PR preview at 1440x900, zoom 10, 233 peaks, eight cloud tiles in view: 310 ms from a scrub to the map's idle, markers included, against the player's 500 ms a frame. A wider view or a slower machine may not keep up.
- The slot order is the maintainer's (record 0268); `cloud` after `trails` is proposed here.
