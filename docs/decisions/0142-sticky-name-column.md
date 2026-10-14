# 0142. The results table's Name column stands still while the table scrolls sideways

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14
- Issues and PRs: #696, #708, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTable.tsx`, `ResultsTableRow.tsx`, `ResultsTableHeader.tsx`

## Context

The results table is about a dozen columns wide. On a phone three or four show at a time, and a number read two swipes from its name was a number with no destination.

## Decision

- **The Name column sticks at the table's left edge**, header and body, at both widths (`TABLE.stickyNameCell`, `TABLE.stickyNameHead`).
- **The chart box and the rank do not stick.** They scroll away under the name like any other column. Sticking them as well would need offsets the rank's digits move, and they take 81px the data needs (below).
- **Opaque**: the body cell lays the panel's slate-800 and the header cell the header's slate-700, and the row's hover tint is a gradient laid over that fill, since a translucent fill cannot tint an opaque one from under it.
- **`index.css`'s `.scroll-shadow-head th { position: relative }` skips a sticky cell**, which already holds the shade's strip; unlayered, it beat the utility and pinned the header cell where it stood.

## Evidence

Measured 2026-10-14 on a ring of ten Cascade peaks with a coarse pointer, the widest name `Blowdown Mountain`:

| Viewport | Chart box | Rank | Name | Left for data |
|---|---|---|---|---|
| 360 | 30 | 51.4 | 210 | 150 |
| 390 | 30 | 51.4 | 210 | 180 |
| 430 | 30 | 51.4 | 210 | 220 |

All three stuck would take 291px of 360. Scrolled 300px sideways, the name cell and its header stand at 0 at every width.

## Alternatives rejected

- **The chart box, the rank and the name stuck together:** 291px of a 360px screen.
- **A cap on the name's width:** left to the maintainer, who wants to see the phone table before choosing its columns.

## Consequences

A long name holds its width while the rest scrolls. A name column dragged to the middle of the table sticks once it reaches the left edge.
