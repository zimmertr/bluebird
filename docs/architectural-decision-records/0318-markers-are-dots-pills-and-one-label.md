# 0318. A marker is a dot, the top five are pills, and one name shows

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, keeping the prototype's markers; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0318
- Guide: `frontend/src/map/CLAUDE.md` (`resultsLayer.ts`, `mapStyles.ts`, `mapPopups.ts`), `frontend/src/hooks/CLAUDE.md` (`useHoverLink.ts`)

## Context

Every ranked marker was a 20px disc with its rank inside and its name under it, so a field of two hundred destinations was two hundred names over the map's own, and the ground the relief now draws was hidden under them. The prototype draws a ranked place as a small dot in its colour, the top five as numbered pills, a place not yet forecast as a smaller grey dot, and one label: the first place's, or the one the pointer rests on, in the map or in its row, which both ring.

## Decision

- **Dots and pills.** `RESULT_MARKER_PAINT` draws a ranked marker 9px across, and a 22px pill for the top five (`TOP_RANKS`), whose rank alone is drawn (`RANK_FILTER`). A pending place is `IDLE_MARKER_PAINT`, a 7px grey dot. Each keeps the white stroke over the dark halo that reads on any ground (#799).
- **One label.** `results-labels` shows the first place and the hovered one (`labelFilter`), as its name with its height under it a step smaller (`LABEL_TEXT`, `heightLabel`). An idle dot's name shows only while hovered (`hotFilter`).
- **The hover link.** Both sources are keyed by the place (`promoteId: 'key'`, the key a table row carries as `data-key`). A pointer over a marker reaches the layer through `mapPopups.ts`'s `hover` on its target, which rings it (`HOT_RING` on the halo through feature-state) and calls `onMarkerHover`; `useHoverLink` marks that row `data-hot`, which `TABLE.row` paints as its hover. A row under the pointer calls `MapViewHandle.hotMarker`. Both halves are imperative, so a hover re-renders no row.

## Evidence

- `resultsLayer.test.ts` pins the paints, the rank filter, and the label and ring following `setHot`. `mapPopups.test.ts` pins a hover target told once per change and null as the pointer leaves. `useHoverLink.test.tsx` pins both halves, and that a finger has no hover.

## Open

- An opened card names its place itself, so the label does not also follow the opened card.
- A pasted list's names no longer stand on the map before a forecast; each shows under the pointer.
