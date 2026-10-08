# 0123. The marker popup is a grid at every width, and a card that cannot stand whole scrolls its body

- Status: Accepted
- Date: 2026-10-08
- Decider: the maintainer, on #683 (2026-10-08: "Lets rework the marker popup to use the compact grid instead. On both desktop and mobile. And then when resolution reaches a certain small threshold, it switches to a capped height box with a scrollbar")
- Issues and PRs: #683, #684, #370
- Cited in code as: TJ, 2026-10-08
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupRows.ts`, `popupChrome.ts` and `popupFit.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `popups.ts` and `resultsLayer.ts` bullets; [`docs/USAGE.md`](../USAGE.md), the map popup paragraph

## Context

The marker popup set each metric family as a heading line with its aggregates on an indented line under it (TJ, 2026-09-14), and its height was deliberately unbounded, on the reasoning that a tall card is easier to live with than one scrolled inside a map that itself scrolls. With the cloud deck on every report ([0121](0121-cloud-deck-fetched-on-every-analysis.md)) the card on a 360 × 740 phone grew to 451 px and no placement kept it clear of the top control stack and the tutorial's card, which the browser suite's tutorial test caught.

## Decision

- **A grid at every width.** A row per metric family, a column per aggregate (Min, Max, Avg and Total, in that order for every family), the aggregate words said once in a header row. Precipitation and snowfall are one line each, labelled with their rate (`Precipitation (in/hr)`), and their window total in inches stands in the Total column with no unit, which is empty for every other family (the maintainer, 2026-10-08: "We can probably trust users to interpret this"). A Current lookup has no aggregate columns, so every line is a label and its value. It is a real `<table>` with row and column headers. `popupGrid` in `popupRows.ts` derives it from the visible columns and `metricGrid` in `popupChrome.ts` draws it.
- **Each column is a band.** Every value and head cell sits on slate-100 with a 2px white gutter on its left, so the four columns read as columns (picked from mockups of striped rows, column bands and tiles). Link text on the band is 5.42:1 and label text 6.92:1.
- **No label wraps, and the card is as wide as that takes.** A ranked destination's popup is 340px wide, or the map less 10px a side where the map is narrower, and its grid runs under the close button's lane, which only the lines above the rule need. On a 360px phone that is 94% of the map, where every other popup keeps a four-fifths share (the maintainer accepted it, 2026-10-08). A phone narrower than the grid scrolls the grid sideways rather than spill it.
- **The elevation is in the header.** The type, the elevation and the coordinates share one line under the name, parted by a pipe a screen reader skips: `Peak | 12,281 ft | 46.20240, -121.49090` (approved 2026-10-08). A place with no elevation drops that part. A comparison's model takes its own line above, because a model's name can be as long as the rest of the line.
- **A bound held all window is said once.** A cloud deck that stayed above the walk, or at its bottom, for the whole window prints the same bound ([0122](0122-cloud-deck-edges-print-as-bounds.md)) under Min, Max and Avg, and three of them do not fit: the `≥` falls back to a wider face. Such a row prints its bound once across those three columns and leaves Total empty. A deck that reached the ceiling in some hours only has it under Max alone, which fits. Three equal heights keep their columns: they are readings, not a bound.
- **A scroll cap where the card cannot stand whole.** The "small threshold" is measured rather than a fixed breakpoint: `capHeight` in `popupFit.ts` finds the tallest card that the fit can place wholly inside the free map area, and when the card is taller, `map/resultsLayer.ts` caps its body and scrolls it under the title, which stays in view. `map.css` keeps the scrollbar drawn (`.popup-scroll`). Below `MIN_CAPPED_PX` (200 px) a cap would leave a keyhole, so the card keeps the title-first fit instead.

## Evidence

Measured 2026-10-08. The monospace face differs by platform: the Playwright image resolves it at 6px a character and Chrome on macOS at 7.2px, so widths were taken on macOS and heights in the Playwright image the browser suite uses.

Widths in Chrome on macOS, against the old card's 238px of grid:

| What | Needs |
| --- | --- |
| Min, Max and Avg with today's labels, widest values | 262 px |
| Min, Max, Avg and Total, widest label and values | 316 px, 319 with the last band's inset |
| The header line for a trailhead, the longest type | 278.7 px |
| The same with two decimals instead of three | unchanged: the columns take their width from the heads and the freezing level and cloud deck |

The tutorial's demonstration card, Mount Baker, as built:

| Where | Card | Body |
| --- | --- | --- |
| Stacked layout, 360 × 740 | 451 px tall, over the controls | whole |
| Grid with a Total line, 1280 × 720 and 360 × 740 | 304.5 px tall | whole |
| Grid with a Total line, 360 × 600 | 261.5 px tall | capped, 155 of 198 px |
| Final grid, 1280 × 720, 360 × 740 and 360 × 600 | 232.5 px tall | whole |
| Final grid on macOS | 311.7 px wide, grid 291.7 px | no label wraps |
| Final grid on macOS, a 320 px map | 300 px wide | grid scrolls sideways |

## Alternatives rejected

- The grid on phones only: two layouts to keep, for no gain on a desktop (the maintainer, 2026-10-08).
- A fixed viewport breakpoint for the cap: it would scroll cards that fit and miss ones that do not, since the free area depends on the legend, the forecast player, the results sheet and the tutorial's card as much as on the screen.
- Each family keeping its own aggregate order: a grid has one set of columns, so AQI's Avg, which leads its table group, now stands last like every family's.
- Precipitation and snowfall in a block of their own beside a three-column grid: it fit the old 280px card only in the Playwright image's narrower monospace, and on macOS the three-column grid alone needs 262px of 238. The maintainer preferred one grid.
- Total as the first column: the maintainer asked for it last.
- Two decimals for precipitation and snowfall to narrow the grid: it narrows nothing (above).
- `Total (in)` as the head: the maintainer dropped the unit, trusting the reader.

## Consequences

Supersedes the two popup rules of 2026-09-14 recorded in `popupChrome.ts`: the heading-and-values block (`groupBlock`, `groupValue`, and the `SEPARATOR_COLOR` between values, all removed) and the unbounded height. A new metric family adds one grid line, about 18 px, rather than two. The four-fifths width share in `popupWidth` now holds for every popup but this one.
