# 0320. The desk's column draws a compact table

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. The strip's width amended by [0325](0325-the-column-takes-the-prototypes-proportion.md); the headers, name and score by [0326](0326-the-desk-column-reads-like-the-prototype.md).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, keeping the prototype's results column; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0320
- Guide: `frontend/src/components/CLAUDE.md` (`ResultsTable.tsx`, `ResultsTableRow.tsx`, `HourStrip.tsx`), `frontend/src/utils/CLAUDE.md` (`tableColumns.ts`), `frontend/src/utils/score/CLAUDE.md` (`hourStrip.ts`, `headline.ts`)

## Context

The desk's results column (record 0312) drew the whole table: a chart checkbox, the type, the elevation and every metric the Columns menu holds, so at the column's width a reader scrolled sideways to see more than the first three numbers. The prototype's column reads the field at a glance: the rank, the name with its height and its best hours under it, the score, the window's hours as a strip of days, and the two numbers a reader checks first on a summit, the highest wind and the lowest temperature. Everything else is behind the column's expand button.

## Decision

- **The columns.** `compactColumns` is the name, then the score and the hours (`HOURS_COL`, keyed on the row's `score_hours`) while a lens ranks, or the ranked metric otherwise, then `COMPACT_KEYS`, the highest wind and the lowest temperature, never one twice. The Columns menu does not shape it: it shapes the table the expand button opens.
- **The name's line.** Under the name, the height and the best stretch, as `6,007 ft · best Sat 1p–5p` (`heightLabel`, `bestWhen`), the stretch in the table's own ink.
- **The strip.** `HourStrip`, given the field's grid, draws one block per local day (`stripDays`) at a fixed 160px, the prototype's at a column of its usual size (asking for the table's spare width widened the table past the column), every hour one height, and a bracket under the best four in the strong ink. The header over it names each day over its block, the two rows sharing one gap. Nothing sorts on the hours.
- **No checkboxes.** The compact table draws no chart checkbox. Picking the chart's lines is part of the table the expand button opens.
- **The column only.** `ResultsPanels` hands the compact set to its `part="column"` table. A phone's sheet and the full table keep the full set.

## Evidence

- `tableColumns.test.ts` pins the two column sets, `hourStrip.test.ts` the days, `headline.test.ts` the best line, `HourStrip.test.tsx` one block per day with one bracket, `ResultsTable.test.tsx` the compact table's header, line and missing checkbox, and `styles.test.ts` that the day names and the blocks share their gap.

## Open

- The prototype heads the wind and temperature columns `Wind` and `Low`. These keep the approved metric labels, which are wider; a shorter pair waits on the maintainer's word.
- The strip's days come from the first scored row. A row whose window lacks a whole day of daylight would draw fewer blocks than the header names.
