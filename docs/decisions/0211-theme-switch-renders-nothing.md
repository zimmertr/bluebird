# 0211. A theme switch re-renders no row or line, and holds transitions off while it lands

- Status: Accepted. Amends 0158 (a switch no longer re-renders the table and the chart). Amended by 0228: the `line-edge` token and the hover dot's rule are gone.
- Date: 2026-10-21
- Decider: the maintainer (TJ), on the review of PR #789: reported that a switch took "almost 1 second" and chose to fold the fix into #786. How it is fixed is Claude's call, flagged on the PR.
- Issues and PRs: #786, #789, #790, #706, #733
- Cited in code as: #786, record 0211
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `index.css`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useTheme.ts`, `useChartSelection.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `themeColor.ts`, `colors.ts`, `chartColors.ts`, `resultsCells.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`, `ResultsTableRow.tsx`; [`docs/STYLES.md`](../STYLES.md), Two themes; [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md), The render probe

## Context

Record [0158](0158-light-theme-behind-semantic-tokens.md) painted every class through tokens, so a switch repaints every class in one style recalculation. Two kinds of colour could not ride a token: the SVG presentation attributes Recharts writes, which do not resolve `var()`, and a ranked cell's ink, which is interpolated per value rather than picked from a few tokens. Both came from props, so the theme reached every row and every chart line, and a switch re-rendered all of them. Record 0158 measured that at 639 ms at 946 displayed rows and 165 ms at the default 200.

The maintainer found a switch "almost 1 second" on PR #789. Measured on that branch, the cost had three parts: React re-rendering every row and line, the browser recomputing every element's style under the new tokens, and nearly 5,000 colour transitions the switch started on the rows' hover styles.

## Decision

- **A colour that differs by theme and lives outside a class is written as `light-dark(light, dark)`** (`themed` in `utils/themeColor.ts`). It resolves against the root's `color-scheme`, which `index.css` sets with the theme. A ranked cell's ink (`cellStyle`), every chart line and swatch (`lineColor`, `paletteColors`) and the chart's chrome (`CHROME`) are one string that never changes, so the table, the chart and their hooks take no theme, and a switch re-renders none of them. The theme stays React state for the one thing that must re-render: the switch's own glyph and name.
- **A mark in a line's colour wears the `line-edge` token** (`LINE_EDGE`): the light `ink-soft`, and transparent in dark, where the lines need no rim. The hover dot's rim is a rule in `index.css` rather than Recharts' `activeDot` prop, and the rim filter is defined in both themes and applied in light by the rule 0158 added.
- **A switch holds every CSS transition off for the frame it lands in** (`.theme-switching` on the root, `THEME_SWITCHING_CLASS` in `useTheme.ts`): the hook adds the class, writes the attribute, makes the browser resolve the new style, and takes the class off in the next animation frame. Theme libraries do the same (next-themes' `disableTransitionOnChange`). It is a rule in the stylesheet rather than an injected `<style>` element, because the CSP's `style-src-elem 'self'` refuses one.
- **What is left grows with the table**: the browser recomputing the style of about 50 elements per row. Mounting only the rows in view is the structural fix, and its trade-offs are the maintainer's, so it is #790 rather than part of this change.

## Evidence

Measured 2026-10-21 in headless Chromium against three built images of the PR's branch, with every third-party host answered from fixtures, by `frontend/e2e/perf/themeSwitch.spec.ts`. Each cell is the median of 10 presses, five each way: synchronous work / first frame painted after the press / end of the last transition the switch started, in ms.

| State | Elements | Before | Theme out of the props | And transitions held |
|---|---|---|---|---|
| No report | 218 | 13 / 38 / 170 | 14 / 38 / 173 | 9 / 33 / 33 |
| 200 rows, Table | 10,359 | 92 / 194 / 284 | 91 / 183 / 279 | 61 / 90 / 90 |
| 200 rows, Both | 11,054 | 143 / 194 / 314 | 93 / 164 / 282 | 63 / 103 / 103 |
| 946 rows, Table | 47,659 | 339 / 660 / 690 | 335 / 552 / 652 | 199 / 307 / 307 |
| 946 rows, Both | 50,597 | 603 / 770 / 922 | 328 / 531 / 632 | 200 / 310 / 310 |

The switch started 4,822 transitions at 946 rows in Table mode before, and 75 with no report. With the hold it starts none. Taking the theme out of the props removed the chart's share: Both mode had cost 264 ms more synchronous work than Table at 946 rows, and now costs 1 ms more. Holding transitions off then took about 245 ms off the first frame at 946 rows. What remains is about 6 µs per element at both sizes.

`light-dark()` resolved in SVG presentation attributes, inline styles and `accent-color`, and followed a change to the root's `color-scheme`, in Chromium 156, Firefox 157 and WebKit 27.2 (a probe page, 2026-10-21).

## Alternatives rejected

- **Each colour as a per-element custom property**, the way the popups take theirs (record [0163](0163-popups-follow-the-theme.md)). A cell's ink is interpolated per value, so it would carry both values as properties with a rule choosing one, two declarations where `light-dark()` is one value, and an SVG attribute cannot read `var()` at all, so every chart colour would move from an attribute to a style.
- **Leaving transitions running**: 552 ms to the first frame at 946 rows, where the hold paints in 307.
- **An injected `<style>` element to hold them off**, next-themes' own way: the CSP refuses it.
- **Mounting only the rows in view now**: it costs find in page for rows out of view and needs row counts for screen readers, which are the maintainer's calls. Filed as #790.

## Consequences

`useResultsView`, `useChartSelection`, `useChartCompare`, `ResultsSheet`, `ResultsPanels`, `ResultsTable`, `ResultsTableRow` and `TimeSeriesChart` take no theme. A new colour outside a class goes through `themed`: the linter's colour-value check knows `light-dark` and lets `themeColor.ts` spell it. `colors.test.ts` and `chartColors.test.ts` pin the pairs, `useTheme.test.tsx` the hold, and `styles.test.ts` the two rules in `index.css`. `make perf` runs the switch probe beside the render probe.

`light-dark()` needs Chrome 123, Firefox 120 and Safari 17.5, from late 2023 and 2024. Tailwind v4 already needs Chrome 111, Safari 16.4 and Firefox 128, so the floor rises for Chrome and Safari only. An older browser drops the value: a ranked cell falls back to the row's text colour, and a chart line draws no stroke.
