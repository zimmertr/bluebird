# 0330. A phone's results sheet ranks by a lens, in compact rows

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0307](0307-a-score-with-lenses-ranks-the-field.md) (a phone opens on the default lens too) and [0321](0321-the-column-widens-over-the-map-for-every-column.md) (a phone's sheet widens by the same button).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17 and 2026-11-21, keeping the prototype's phone and putting it third in the order of work; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0330
- Guide: `frontend/src/components/CLAUDE.md` (`ResultsBar.tsx`, `ResultsPanels.tsx`, `LensChips.tsx`, `LimitChips.tsx`), `frontend/src/utils/CLAUDE.md` (`tableColumns.ts`, `layout.ts`); `docs/STYLES.md` (`RESULTS_HEAD`, `OPENED_ROW`)

## Context

The prototype's phone sheet is the desk's column on a phone: a grip, the headline over its subtitle, one row of lenses and limits that scrolls sideways, and compact rows of the rank, the name, the score and the day's hours. The build's phone sheet ranked by a metric with no lens, kept the full table with every column, and carried the toolbar on every sheet.

## Decision

- **A phone opens on the default lens**, as a desk does, and the lens chips can switch it or turn it off to rank by the metric again.
- **The headline stands over its subtitle** on a phone's sheet, the desk's two lines.
- **One row of lenses then limits scrolls sideways** under the headline (`RESULTS_HEAD.phoneRow`), so the header keeps one height however many limits stand. `+ Limit` opens the Controls sheet.
- **The sheet draws compact rows**: the rank, the name with its elevation and best hours, the score and the hours strip, without the desk's wind and low, which would squeeze the name at 360px (`compactColumns(…, true)`). A press opens a row in place, as at a desk (record 0327), its facts in two columns under 400px of table.
- **Every column widens the sheet**, the desk's expand button: the full table, the toolbar and the chart come back, and the mode the reader last chose with them. Compact, the sheet lays out as Table (`tableOnly`).

## Consequences

- The chart, Columns, Removed and Download CSV are one press further away on a phone, behind Every column, as they are at a desk.
- The sheet's header is taller with the second line and the chip row; its estimate (`SHEET_HEADER_PX`) is re-measured with it.
- No string is new.
