# 0155. A phone's Chart rests at the sheet's full stop

- Status: Accepted. Amends [0154](0154-phone-readout-rises-into-the-sheet.md)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696 (round 9 review of #708), 2026-10-14
- Issues and PRs: #696, #708
- Cited in code as: #696
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`docs/USAGE.md`](../USAGE.md), the results bar

## Context

A phone's results sheet has two stops: rest, sized so the map keeps its legend stack above the sheet, and full, as high as a drag takes it. Rest is the table's: at rest the chart's plotting band is 68px at 390x844, 18px at 360x740 and 5px at 393x727, too short to read a line from, and record 0154 had to lift the readout out of the band to keep it whole. The tutorial's Chart step already held the sheet at full for the same reason.

## Decision

- **Picking Chart on a phone lifts the sheet to its full stop**, the same drag cap the tutorial's Chart step holds (`fullOverride`). It is a render-time hold over the reader's stored heights, not a write to them.
- **Table comes back at the height it had before Chart was picked**, the way the tour gives the height back: nothing the lift did touched the table's height.
- **A drag on the Chart is the reader's and wins.** The drag starts from the full stop and the sheet stays where the reader leaves it for as long as Chart is up. Leaving Chart forgets the drag, so the next pick lifts it again, and a double press on the grip puts the Chart back at its rest, which on a phone is now the full stop.
- **The camera frames above the full stop** while a phone's Chart is lifted: it is a fixed height rather than a live one, so a searched place is not framed under the sheet.
- Both and a desk are unchanged.

## Evidence

`useResultsLayout.test.tsx` holds the lift, Table's return to a dragged height, a drag on the Chart winning until Chart is picked again, the double press, and the tutorial's hold giving a dragged Chart back. `chartTap.spec.ts` picks Chart at 390x844 and finds the sheet's top more than 200px higher, then picks Table and finds it back where it was.

## Consequences

On a phone the Chart leaves the map its two rows and the Analyze button's strip; the legend stack scrolls, as it does under any dragged sheet. Record 0154's rise into the sheet now matters only on a Chart the reader has dragged short.
