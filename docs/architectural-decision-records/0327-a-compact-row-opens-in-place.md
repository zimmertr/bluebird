# 0327. A press on a compact row opens it in place

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0143](0143-row-opens-its-popup.md) for the desk's compact table only. Amended by [0332](0332-the-review-answers-of-2026-11-21.md) (the maintainer's review answers).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17 and 2026-11-21, keeping the prototype's opened row and putting it second in the order of work; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0327
- Guide: `frontend/src/components/CLAUDE.md` (`OpenedRow.tsx`), `frontend/src/utils/score/CLAUDE.md` (`summitProfile.ts`); `docs/STYLES.md` (`OPENED_ROW`)

## Context

The prototype's tenth idea is the summit against the cloud: a press on a row opens it in place and draws the summit, the deck's base and top, the freezing level and the night hour by hour, with the facts and two actions under it. The build's row press flew the map to the place and opened its card (record 0143), which on a desk moves the map away from the field the reader was comparing.

## Decision

- **In the compact table**, a press on a row's ground opens it in place, and a second press shuts it. One row is open at a time, held by its place's key, so a re-rank keeps the same place open.
- **The opened row** draws the profile (nights darkened under the scrim, each hour's deck as a band from its base to its top, the summit as a line with its height, the freezing level dashed, a step per hour, and the best four hours boxed), a key (`Summit {height}`, `Cloud`, `Freezing level`), eight facts (`Best hours`, `Low`, `Wind`, `In cloud`, `Freezing`, `Precip`, `New snow`, `AQI`, each value as its column prints it) and two actions: `Show on map`, the name's own fly-to and card, and the row's external map link under its existing name (`View on Peakbagger` and the rest).
- **The map** rings the opened row's marker whenever the pointer is off the rows, through the hover link (record 0318).
- **The full table** behind the expand button keeps record 0143: a press flies the map and opens the card.
- **The profile is drawn with boxes**, not an `<svg>`, because the glyph rule keeps every `<svg>` in `icons.tsx`; so the freezing level is a dashed step per hour rather than a curve.

## Consequences

- The row opens by pointer only. A keyboard reaches the place through the name's button, which flies the map, and the opened row's facts are not yet reachable without a pointer.
- The new words are in the PR's strings table for approval.
