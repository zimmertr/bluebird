# 0332. The maintainer's review answers of 2026-11-21

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0316](0316-a-loop-is-drawn-in-one-stroke.md) (the draw buttons' names), [0322](0322-the-legend-stands-at-the-column-foot.md) (the score key's words) and [0327](0327-a-compact-row-opens-in-place.md) (a keyboard opens a compact row).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, answering the review calls logged while they were away
- Issues and PRs: #825
- Cited in code as: TJ, 2026-11-21
- Guide: `frontend/src/components/CLAUDE.md` (`DisclosureButton.tsx`, `ResultsTableRow.tsx`, `MapLegend.tsx`, `ControlPanel.tsx`, `DestinationsSection.tsx`); `frontend/src/utils/CLAUDE.md` (`sentenceBar.ts`); `docs/STYLES.md` (`LEGEND_SCORE`, `ROW_DISCLOSURE`)

## Context

Building the prototype while the maintainer was away left five calls open: what the draw buttons are called now that they draw freehand, what the sentence says for Current, what the score key prints, how a keyboard opens a compact row, and where the Controls sheet opens on a phone.

## Decision

- **The draw buttons read `Draw a loop` and `Edit loop`**, the map tool and the Where card alike.
- **Current reads `for this hour`**: `Peaks in this view for this hour`. The maintainer first picked `for the next 24 hours`, but Current forecasts the hour of the press, so the words name that hour rather than widening the window.
- **The score key is the prototype's line**: `Fog {low}`, the ramp, `{high} Bluebird`, the field's own lowest and highest scores (`LEGEND_SCORE`). A metric's key keeps its label and ticks.
- **A compact row carries a disclosure**, a chevron at its end with `aria-expanded`, named `Details for {name}` (`DisclosureButton`, `ROW_DISCLOSURE`). It is not a `MenuButton`, since it opens content in place, and `style-menu-trigger` exempts its one file.
- **A phone's phrase scrolls the Controls sheet to its section**, at once, by the section's tour anchor (`ControlPanel`'s `scrollTo`).

## Consequences

- The polygon row's 4px inset no longer has a label that needs it: `Draw a loop` fits a third at 12px too. The row keeps the inset.
- New strings: `Draw a loop`, `Edit loop`, `for`, `this hour`, `Fog`, `Bluebird` (as the key's end word), `Details for {name}`, in the PR's strings table.
