# 0239. The ranked columns stand right after Name, and the aggregate menu is 60px

- Status: Accepted
- Date: 2026-10-28
- Decider: the maintainer (TJ), on #586
- Issues and PRs: #586, #708, #341, #238
- Cited in code as: #586
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/tableColumns.ts` bullet; [`STYLES.md`](../STYLES.md), `SELECT_W_AGGREGATE`; [`USAGE.md`](../USAGE.md), the results table

## Context

On a phone the table's first view held the rank, the name, Type and Elevation. The value the rows were ranked by started off screen, so a reader had to scroll sideways to learn why a row ranked where it did. Record 0142 already keeps Name in view on a sideways scroll. The issue also found `Freezing level` cut off in the Metrics grid on a phone while a date range puts the aggregate menu beside it.

## Decision

The ranked metric's columns stand directly after Name, then Type and Elevation, then the other families in their canonical order, then Wildfire and Closure. Model, while comparing, still sits between Name and the ranked group. The order is the same at every width, because the CSV follows the screen and a desk and a phone should download the same file. A change to Rank by still discards a reader's own order (record 0037).

`SELECT_W_AGGREGATE` drops from 72px to its 60px floor: the widest aggregate word (28px), the field's 8px left inset and the 24px `SELECT` keeps for its arrow. The 12px of slack goes to the label.

## Evidence

Measured 2026-10-28 on the built image in Playwright's Chromium at 360x780 with touch emulated, five fixture peaks, ranked by AQI:

- The ranked column started at 325px on main, on the screen's right edge. It starts at 173px on this branch.
- With a date range, the Controls sheet's Metrics grid is 328px wide, and its scroller reserves no bar. The label's grid cell was 126px on main and is 138px now. `Freezing level` measures 74.7px there and 78.03px in Chrome on macOS (2026-09-14).
- At a desk the panel's 327px less the 10px bar leaves the label text 103px at 60px and 91px at 72px. At the phone's 328px it is 114px, where it was 102px.

The issue's 295px of phone content no longer holds: the sheet now takes the screen's width less its gutters. So at 360 the noun already fitted on main, and the narrower menu is margin for narrower phones and wider fonts. `styles.test.ts` pins both budgets.

## Alternatives rejected

- A phone-only column order: the CSV follows the screen, so a phone and a desk would download different files.
- Hiding Type by default on a phone: #238 settled against it.
- A narrower Name cap: record 0142 set it, and the ranked value would still start off screen.
- Narrower metric boxes: record 0040 ties `METRIC_BOX_W` to `CONTROL_W`.
- A label that wraps: it doubles the row's height for one noun.

## Consequences

Tests that read a cell by its position read the Type cell by its header now (`typeCell` in `frontend/e2e/fixtures.ts`). The aggregate menu has no slack left, so a longer aggregate word widens it.
