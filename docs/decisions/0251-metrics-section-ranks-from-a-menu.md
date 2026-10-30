# 0251. The Metrics section ranks from a menu, and a bound row stands only while it is set or just added

- Status: Accepted. Amends 0038 (the section still reads in two blocks, but the bounds are no longer a row for every metric, and Clear filters is no longer always drawn) and 0130 (the pitch its margin bought is not needed once the radio label goes).
- Date: 2026-10-28
- Decider: the maintainer, on #498 (decisions of 2026-10-28: option A; the labels `Metric`, `Aggregate`, `Order` and `Max results`; the adder `Bound` with the placeholder `Add a bound`; Clear filters drawn only when something is set; Max results kept in the section). Option E was recommended and declined.
- Issues and PRs: #498
- Cited in code as: #498
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, the paragraph "A control sits beside its label", the Metrics grid's sentence; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MetricsTable.tsx`, `MetricsTable.test.tsx` and `Menu.tsx` bullets; [`docs/STYLES.md`](../STYLES.md), the Metrics paragraphs under the control column and `MENU`; [`docs/USAGE.md`](../USAGE.md), Metrics
- Related: 0038 (one Metrics table in two blocks), 0130 (the rows pass by spacing), 0201 (one menu for every trigger), 0236 (a metric the window cannot answer greys)

## Context

The Metrics section drew a row for every ranked metric, each with a radio, an aggregate menu and two bound boxes, whether or not the reader had any use for it. With seven ranked metrics (#670 merged the two cloud rows, #678 swapped snow depth for snowfall) the section under its heading was eleven rows: two wide controls, the Min/Max headings, seven metric rows and Clear filters. Every new metric added a row to the panel.

## Decision

- **Five rows at rest**: `Metric` (a menu over `RANKED_FAMILIES`), `Aggregate` (a menu over the ranking family's aggregates, hidden for a single-hour window), `Order` (the Lowest/Highest segment), `Max results`, and `Bound` (a menu whose placeholder reads `Add a bound`). A new metric adds an option to two menus, never a row. `Rank by` leaves the panel: four nouns match Model, When and Hours in the Forecast section.
- **The Metric menu ranks through `setSortBy(rowKeys[family])`** and the Aggregate menu through `setSortBy(key)`, so the `useRankingKnobs` invariant (the ranking family's `rowKeys` entry equals `sortBy`) and every URL parameter stand unchanged.
- **A bound row stands while its metric has a floor or a ceiling, or while it is the one the adder last picked**, in `RANKED_FAMILIES` order, with the Min and Max headings over the first. Picking in Bound puts the keyboard in that row's Min box; the menu offers only metrics not already shown. An empty added row leaves when the keyboard leaves it, when another metric is added, or on Clear filters, never under a reader mid-edit. A share link opens with a row for each bound it carries.
- **Clear filters is drawn only when something is set**, a bound or a changed Max results, and clears every bound, the cap and the added row. This reverses #341's always-drawn button: here the rows above it move anyway.
- **The grid is label, Min box and Max box.** The three menus, the segment, the cap and Clear filters span the two box columns, which is `CONTROL_W` by construction. `SELECT_W_AGGREGATE` goes with the per-row menus.
- **A desk opens `MenuSelect`, a phone the native select** (record 0201). `MenuSelect` takes a `null` value with a `placeholder`, and options that carry `disabled`.
- **From #803** (record 0236): a metric the window or models cannot answer is a disabled option in Metric and Bound, its bound row greys with its values kept, and an inverted pair keeps `aria-invalid`.

## Evidence

- Measured on `main` at `e711c2d` (2026-10-28), 1440x900, fine pointer: the section was eleven rows and 387px tall, with the Wind row and Clear filters below the fold before any scroll. With Dates selected every row also carried an aggregate menu, six of them muted.
- The labels, pinned in `styles.test.ts`: the Metric field at `CONTROL_W` offers 84px of label (118 less 8 of padding, 24 of chevron and 2 of border), against `Freezing level` at 78.03px (measured 2026-09-14). `Add a bound` must fit the same 84px and is estimated at about 62px; it is not yet measured.
- The pitch: with no radio label, a row is its 22px controls and the grid's 6px gap, 28px apart, so a 24px circle on each clears the next by 2px on each side. `METRIC_LABEL_PITCH` is removed, and the arithmetic is pinned in `styles.test.ts`.

## Alternatives rejected

- **E, a Bounds field that unfolds the full table**: recommended and declined. It keeps every metric's row one press away, and costs a field and a second state for the section.
- **B and C**, mocked beside A and E on the same page (2026-10-28): declined with E for A.
- **Keeping Clear filters always drawn** (#341, TJ 2026-09-14): it held the section's last row still, which the bound rows above it no longer do.

## Consequences

`MetricsTable.test.tsx` holds the five rows, the adder, the added row's lifetime, the share-link rows and the conditional Clear filters. The linter's `style-metrics-table` check requires Clear filters inside `filtersActive &&` and under the box columns, and `style-menu-field` still counts one menu field in the file, which the local `Choice` supplies for all three menus. The section is shorter at rest and grows a row for each bound, so its height now moves with what the reader sets.

The box tracks are `auto`, so with no bound row drawn nothing in them had a width of its own. Measured on the first build at 1440x900 on 2026-10-29, the menus stood 106px wide at rest and would have grown to 118px when the first bound row appeared. The Order segment therefore wears `SEGMENT` and with it `CONTROL_W`: it is always drawn, it holds the tracks at two boxes and their gap, and every other control spanning them fills them. `SEGMENT_FILL`, which existed only for that segment, is gone. At rest the section measured 153px on that build, against 387px before.
