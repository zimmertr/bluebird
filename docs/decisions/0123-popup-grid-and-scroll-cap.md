# 0123. The marker popup is a grid at every width, and a card that cannot stand whole scrolls its body

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on #683 (2026-10-08: "Lets rework the marker popup to use the compact grid instead. On both desktop and mobile. And then when resolution reaches a certain small threshold, it switches to a capped height box with a scrollbar")
- Issues and PRs: #683, #684, #370
- Cited in code as: TJ, 2026-10-08
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupRows.ts`, `popupChrome.ts` and `popupFit.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `resultsLayer.ts` bullet

## Context

The marker popup set each metric family as a heading line with its aggregates on an indented line under it (TJ, 2026-09-14), and its height was deliberately unbounded, on the reasoning that a tall card is easier to live with than one scrolled inside a map that itself scrolls. With the cloud deck on every report ([0121](0121-cloud-deck-fetched-on-every-analysis.md)) the card on a 360 × 740 phone grew to 451 px and no placement kept it clear of the top control stack and the tutorial's card, which the browser suite's tutorial test caught.

## Decision

- **A grid at every width.** A row per metric family, a column per aggregate (Min, Max, Avg, in that order for every family), the aggregate words said once in a header row above the first family. The elevation leads, above the header, as a value of its own. Precipitation and snowfall take two lines: the window total in inches, then their rates under it labelled by their unit, which a screen reader hears with the family's name. A Current lookup has no aggregate columns, so every line is a label and its value. It is a real `<table>` with row and column headers. `popupGrid` in `popupRows.ts` derives it from the visible columns and `metricGrid` in `popupChrome.ts` draws it.
- **A scroll cap where the card cannot stand whole.** The "small threshold" is measured rather than a fixed breakpoint: `capHeight` in `popupFit.ts` finds the tallest card that the fit can place wholly inside the free map area, and when the card is taller, `map/resultsLayer.ts` caps its body and scrolls it under the title, which stays in view. `map.css` keeps the scrollbar drawn (`.popup-scroll`). Below `MIN_CAPPED_PX` (200 px) a cap would leave a keyhole, so the card keeps the title-first fit instead.

## Evidence

Measured 2026-10-08 in Chromium on the tutorial's demonstration report, built from this branch:

| Viewport | Stacked card | Grid card | Body |
| --- | --- | --- | --- |
| 1280 × 720 | | 304.5 px | whole |
| 360 × 740 | 451 px, over the controls | 304.5 px | whole |
| 360 × 600 | | 261.5 px | capped, 155 of 198 px |

## Alternatives rejected

- The grid on phones only: two layouts to keep, for no gain on a desktop (the maintainer, 2026-10-08).
- A fixed viewport breakpoint for the cap: it would scroll cards that fit and miss ones that do not, since the free area depends on the legend, the forecast player, the results sheet and the tutorial's card as much as on the screen.
- Each family keeping its own aggregate order: a grid has one set of columns, so AQI's Avg, which leads its table group, now stands last like every family's.

## Consequences

Supersedes the two popup rules of 2026-09-14 recorded in `popupChrome.ts`: the heading-and-values block (`groupBlock`, `groupValue`, and the `SEPARATOR_COLOR` between values, all removed) and the unbounded height. A new metric family adds one grid line, about 18 px, rather than two.
