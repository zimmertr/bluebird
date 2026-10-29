# 0239. The ranked metric's columns stand right after Name at every width

- Status: Accepted
- Date: 2026-10-28
- Decider: the maintainer (TJ), on #586
- Issues and PRs: #586, #708, #238
- Cited in code as: #586
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/tableColumns.ts` bullet; [`USAGE.md`](../USAGE.md), the results table

## Context

On a phone the table's first view held the rank, the name, Type and Elevation. The value the rows were ranked by started off screen, so a reader had to scroll sideways to learn why a row ranked where it did. Record 0142 already keeps Name in view on a sideways scroll. The issue also reported `Freezing level` cut off in the Metrics grid on a phone while a date range puts the aggregate menu beside it.

## Decision

The ranked metric's columns stand directly after Name, then Type and Elevation, then the other families in their canonical order, then Wildfire and Closure. Model, while comparing, still sits between Name and the ranked group. The order is the same at every width, because the CSV follows the screen and a desk and a phone should download the same file. A change to Rank by still discards a reader's own order (record 0037).

## Evidence

Measured 2026-10-28 on built images in Playwright's Chromium at 360x780 with touch emulated, five fixture peaks, ranked by AQI:

- The ranked column started at 325px on main, on the screen's right edge. It starts at 173px with this order.
- With a date range, the Controls sheet's Metrics grid is 328px wide since #708, and its scroller reserves no bar. On main the label text gets 102px, so `Freezing level` (79px budgeted) fits with 23px to spare. A 320px phone would be short at a 72px menu and at a 60px one alike, so a narrower menu rescued no real width. That is why the issue's row 3 needed no change.
- The aggregate menu's width (`SELECT_W_AGGREGATE`) stays 72px; a change to it was built and reverted on this measurement, 2026-10-28.

## Alternatives rejected

- A phone-only column order: the CSV follows the screen, so a phone and a desk would download different files.
- Hiding Type by default on a phone: #238 settled against it.
- A narrower Name cap: record 0142 set it, and the ranked value would still start off screen.

## Consequences

Tests that read a cell by its position read the Type cell by its header now (`typeCell` in `frontend/e2e/fixtures.ts`).
