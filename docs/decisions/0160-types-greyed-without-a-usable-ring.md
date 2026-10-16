# 0160. The destination-type checkboxes are greyed until the polygon is usable

- Status: Accepted
- Date: 2026-10-15
- Decider: the maintainer (TJ), on PR #731, 2026-10-15
- Issues and PRs: PR #731
- Cited in code as: #731
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `DestinationsSection.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts` bullet

## Context

The Peaks, Crags, Lakes and Trailheads checkboxes, and Include unnamed peaks under them, could be ticked with no polygon, and stayed ticked after Clear. An analysis with no ring sends no types at all (`planAnalysis` sends `destination_types: []` on its custom-only branch), so the ticks did nothing, and nothing on screen said so. The maintainer cleared a polygon, saw the boxes still ticked, and could not tell whether they would change an analysis of a searched destination.

## Decision

The four type checkboxes and Include unnamed peaks are disabled unless the drawn ring is one a polygon search can use: three points or more, inside the area cap. They grey again when the ring is cleared or grows past the cap. A greyed box keeps its tick, so the next ring searches what the reader chose. The rule is `ringUsable` in `utils/analyzeGate.ts`, which the Analyze gate's `polygonReady` also reads, so the boxes and the button cannot disagree about which ring counts. The boxes come alive while drawing as soon as the third point lands, as Analyze does.

## Evidence

No measurement: the decision is about what the panel says. The previous behaviour was confirmed in `analyzeRequest.ts` on 2026-10-15: with no ring, the request carries no types whatever is ticked.

## Alternatives rejected

- Leave the boxes live, as before. A tick that does nothing reads as a tick that does something.
- Hide the row until there is a ring, as the unnamed-peaks knob hides under Peaks. The row sits above the Forecast section, so a ring arriving would move the panel under the reader, which is why the draw row's buttons grey rather than vanish (#687, record 0137).
- Clear the ticks with the ring. The reader would have to tick them again for every new ring.

## Consequences

`DestinationsSection.test.tsx` holds the grey before a ring, at two points, after Clear and past the cap, and the ticks kept through it; `analyzeGate.test.ts` holds `ringUsable`. The browser suite now draws a ring before ticking Peaks. A reader can no longer choose types before drawing.
