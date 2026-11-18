# 0309. The cloud sea is drawn on the ground from the deck the report already holds

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-18
- Decider: the maintainer, 2026-11-17 ("From fetched destinations")
- Issues and PRs: #825
- Cited in code as: record 0309
- Guide: `frontend/src/utils/CLAUDE.md` (`cloudSea.ts`), `frontend/src/map/CLAUDE.md` (`cloudSea.ts`)

## Context

The prototype painted a marine layer in the valleys with the summits standing clear above it, which says at a glance where a day is above the cloud. Its weather was invented. The maintainer chose to draw it from the forecasts the report already fetched rather than from a new request.

## Decision

Every destination's hourly series carries the cloud deck's base and, since record 0305, the top of its layer. At the hour the forecast player stands on, or the window's middle hour while it is off, the base and top are interpolated between destinations by inverse squared distance within 30 km, among the destinations in cloud alone, and the share of the nearby weight in cloud fades the deck's edge. Each pixel of a tile is then painted by where the ground stands against the deck there: inside it near opaque, under it a light veil, above its top nothing, each edge faded over 350 ft. The ground is the elevation tile the relief and the slope read, at zoom 12 and out; the deck is kilometres between samples, so finer ground would sharpen an edge the data does not have. The layer stands in a slot of its own over the trails and under every overlay, label and marker.

A tile no destination is within reach of asks for no elevation, so the layer fetches only the ground under the field. It is drawn while a report holds a field; it has no Layers row yet.

## Evidence

- `utils/cloudSea.test.ts` pins the interpolation, the alpha at every edge, a tile's reach test and a painted tile.

## Open

- A Layers row to switch it off needs the maintainer's wording.
- Playback repaints every tile in view each hour; measured cost is still to take in the preview.
- The slot order is the maintainer's (record 0268); `cloud` after `trails` is proposed here.
