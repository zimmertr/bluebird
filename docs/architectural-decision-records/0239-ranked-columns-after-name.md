# 0239. On a phone the ranked metric's columns stand right after Name

- Status: Accepted
- Date: 2026-10-29 (one order at every width was built 2026-10-28 and narrowed to the phone on review)
- Decider: the maintainer (TJ), on #586 and PR #824
- Issues and PRs: #586, #824, #708, #238
- Cited in code as: #586
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/tableColumns.ts` bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `src/hooks/useTableView.ts` bullet; [`USAGE.md`](../USAGE.md), the results table

## Context

On a phone the table's first view held the rank, the name, Type and Elevation. The value the rows were ranked by started off screen, so a reader had to scroll sideways to learn why a row ranked where it did. Record 0142 already keeps Name in view on a sideways scroll. The issue also reported `Freezing level` cut off in the Metrics grid on a phone while a date range puts the aggregate menu beside it.

## Decision

On a phone's screen the order is `#`, Name, the ranked family's columns, Model while comparing, Type, Elevation, the other families in their canonical order, then Wildfire and Closure. Model stays ahead of Type and Elevation because it still says which answer a row is.

A desk keeps the standard order: `#`, Name, Model while comparing, Type, Elevation, the ranked group, the rest.

The CSV keeps the desk's order on every device. The phone's order is a screen presentation, so a file reads the same whoever downloads it. A reader's own dragged order still lays over both, as before, and a change to Rank by still discards it (record 0037).

## Evidence

Measured 2026-10-28 on built images in Playwright's Chromium at 360x780 with touch emulated, five fixture peaks, ranked by AQI:

- The ranked column started at 325px on main, on the screen's right edge. It starts at 173px with the ranked group after Name.
- With a date range, the Controls sheet's Metrics grid is 328px wide since #708, and its scroller reserves no bar. On main the label text gets 102px, so `Freezing level` (79px budgeted) fits with 23px to spare. A 320px phone would be short at a 72px menu and at a 60px one alike, so a narrower menu rescued no real width. That is why the issue's row 3 needed no change.
- The aggregate menu's width (`SELECT_W_AGGREGATE`) stays 72px; a change to it was built and reverted on this measurement, 2026-10-28.

## Alternatives rejected

- One order at every width: built first, and the maintainer did not want the desk's order to change (2026-10-29).
- The file following the phone's screen: a phone and a desk would download different files.
- Hiding Type by default on a phone: #238 settled against it.
- A narrower Name cap: record 0142 set it, and the ranked value would still start off screen.

## Consequences

Tests that read a cell by its position read the Type cell by its header now (`typeCell` in `frontend/e2e/fixtures.ts`).

A drag on a phone moves a column within the phone's order, so the stored order is that whole list. Without that, a first drag would store the desk's list and snap the phone's columns back to it.
