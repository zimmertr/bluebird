# 0142. The results table's Name column stands still while the table scrolls sideways

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14; the width cap on a Pixel the same evening
- Issues and PRs: #696, #708, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTable.tsx`, `ResultsTableRow.tsx`, `ResultsTableHeader.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useTableView.ts`

## Context

The results table is about a dozen columns wide. On a phone three or four show at a time, and a number read two swipes from its name was a number with no destination.

## Decision

- **The Name column sticks at the table's left edge**, header and body, at both widths (`TABLE.stickyNameCell`, `TABLE.stickyNameHead`).
- **The chart box and the rank do not stick.** They scroll away under the name like any other column. Sticking them as well would need offsets the rank's digits move, and they take 81px the data needs (below).
- **Opaque**: the body cell lays the panel's slate-800 and the header cell the header's slate-700, and the row's hover tint is a gradient laid over that fill, since a translucent fill cannot tint an opaque one from under it.
- **On a phone the column opens at the widest displayed name plus the cell's padding, capped at 45% of the results sheet** (`TABLE.nameCap`, `45cqi` of the table's scroller less the cell's `px-2` either side): 162px at 360 and 175 at 390. A wider name truncates with an ellipsis as it does in a column sized narrow, and the popup a row tap opens shows it whole. The cap is off once the reader drags or fits the column, which stays resizable, and off at a desk, whose table has the room.
- **A desk keeps its sized default** (`NAME_DEFAULT_PX`, 184px); a phone takes none (`useTableView` sizes the name only when `isDesktop`), because that default is what held the phone's column at 210 whatever the names were.
- **`index.css`'s `.scroll-shadow-head th { position: relative }` skips a sticky cell**, which already holds the shade's strip; unlayered, it beat the utility and pinned the header cell where it stood.

## Evidence

Measured 2026-10-14 on a ring of ten Cascade peaks with a coarse pointer, the widest name `Blowdown Mountain`:

| Viewport | Chart box | Rank | Name | Left for data |
|---|---|---|---|---|
| 360 | 30 | 51.4 | 210 | 150 |
| 390 | 30 | 51.4 | 210 | 180 |
| 430 | 30 | 51.4 | 210 | 220 |

All three stuck would take 291px of 360.

Re-measured 2026-10-14 after the cap, on a wider ring whose longest names (`Rattlesnake Mountain - Middle Peak`, `Rattlesnake Mountain - East Peak`) truncate at every width:

| Viewport | Name | Share of the sheet |
|---|---|---|
| 360 | 162 | 0.45 |
| 390 | 175.5 | 0.45 |
| 430 | 193.5 | 0.45 | Scrolled 300px sideways, the name cell and its header stand at 0 at every width.

## Alternatives rejected

- **The chart box, the rank and the name stuck together:** 291px of a 360px screen.
- **No cap on the name's width** (this record's first cut, left to the maintainer until he had seen the phone table): 210px, which he read on a Pixel as too wide.

## Consequences

A long name holds its width while the rest scrolls. A name column dragged to the middle of the table sticks once it reaches the left edge.
