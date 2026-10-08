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
- **Each column is a band, and each line is ruled.** Every value and head cell sits on slate-100, inset 5px a side so `0.000` has room inside its band, with a 2px white gutter on its left, so the four columns read as columns (picked from mockups of striped rows, column bands and tiles). Link text on the band is 5.42:1 and label text 6.92:1. A slate-200 hairline parts every line from the next (the maintainer, 2026-10-08: "very thin minimal lines").
- **Heads centred and bold, numbers right-aligned.** The heads stand centred over their bands, bold, over a `RULE_COLOR` rule, rather than underlined, because every number is an underlined link and an underlined head would read as one more. The numbers stay right-aligned so a column lines up on its last digit, which is the convention for a table of figures. Bold is the title's weight at a size under it.
- **The families run alphabetically.** AQI, Cloud deck, Freezing level, Precipitation, Snowfall, Temperature, Wind, whatever the ranking or the table's column order (the maintainer, 2026-10-08), so a family stands in the same place on every card. This reverses #370's first-appearance order, which put the ranked family first.
- **No label wraps, and the card is as wide as that takes.** A ranked destination's popup is 352px wide, or the map less 10px a side where the map is narrower, and its grid stands 10px from both edges, clear of the close button's lane, which only the header needs. On a 360px phone the card is 340px, 94% of the map, where every other popup keeps a four-fifths share (the maintainer accepted it, 2026-10-08). A label keeps 8px clear of the first band: a desktop card shrinks to its grid, and without it the longest label sat against the band, where a phone's wider card had spare room (the maintainer, 2026-10-08). A map narrower than the grid scrolls the grid sideways rather than spill it; the widest grid does so by about 10px on a 360px phone, which the maintainer accepted.
- **A header band holds the name and the facts.** The name and, on the line under it, the type, the elevation and the coordinates, parted by a pipe a screen reader skips (`Peak | 12,281 ft | 46.20240, -121.49090`, approved 2026-10-08), sit on a sky-100 band with a sky-200 edge and a blue-tinted shadow, in place of the rule the other popups keep (the maintainer asked for it to be visually distinct and Bluebird blue). Labels on it measure 6.6:1, and its link-out glyph takes sky-600 (3.57:1) where the usual sky-400 would fall to 1.87:1. A place with no elevation drops that part. A comparison's model takes its own line, because a model's name can be as long as the rest of the line. The band keeps the close button's lane, which `map.css` widens to 3.375rem on a touch screen: there the button is 44px tall and reaches the facts line, which ran under it while the lane was 2rem (reported on Android, 2026-10-08).
- **A long name ends in an ellipsis.** The title keeps one line and clips its tail, as the results table clips the same name, rather than wrapping the rank onto a line of its own and running a single long word off the card's edge (reported with `Taumatawhakatangihangakōauauotamateapōkaiwhenuakitānatahu`, 2026-10-08). Every popup's title does the same.
- **A bound held all window is said once.** A cloud deck that stayed above the walk, or at its bottom, for the whole window prints the same bound ([0122](0122-cloud-deck-edges-print-as-bounds.md)) under Min, Max and Avg, and three of them do not fit: the `≥` falls back to a wider face. Such a row prints its bound once across those three columns and leaves Total empty. A deck that reached the ceiling in some hours only has it under Max alone, which fits. Three equal heights keep their columns: they are readings, not a bound.
- **A scroll cap where the card cannot stand whole.** The "small threshold" is measured rather than a fixed breakpoint: `capHeight` in `popupFit.ts` finds the tallest card that the fit can place wholly inside the free map area, and when the card is taller, `map/resultsLayer.ts` caps its body and scrolls it under the title, which stays in view. `map.css` keeps the scrollbar drawn (`.popup-scroll`). Below `MIN_CAPPED_PX` (200 px) a cap would leave a keyhole, so the card keeps the title-first fit instead.

## Evidence

Measured 2026-10-08. The monospace face differs by platform: the Playwright image resolves it at 6px a character and Chrome on macOS at 7.2px, so widths were taken on macOS and heights in the Playwright image the browser suite uses.

Widths in Chrome on macOS, against the old card's 238px of grid:

| What | Needs |
| --- | --- |
| Min, Max and Avg with today's labels, widest values | 262 px |
| Min, Max, Avg and Total, widest label and values | 330.1 px with the label's 8px and 5px band insets (299.7 px for the tutorial's card at 3px insets, 315.7 px at 5px) |
| The header line for a trailhead, the longest type | 278.7 px |
| The same with two decimals instead of three | unchanged: the columns take their width from the heads and the freezing level and cloud deck |

The tutorial's demonstration card, Mount Baker, as built:

| Where | Card | Body |
| --- | --- | --- |
| Stacked layout, 360 × 740 | 451 px tall, over the controls | whole |
| Grid with a Total line, 1280 × 720 and 360 × 740 | 304.5 px tall | whole |
| Grid with a Total line, 360 × 600 | 261.5 px tall | capped, 155 of 198 px |
| Grid before the band and hairlines, 1280 × 720, 360 × 740 and 360 × 600 | 232.5 px tall | whole |
| Final card, 1280 × 720 and a 360 × 740 touch screen | 253.5 px tall | whole |
| Final card, a 360 × 600 touch screen | 221.5 px tall | capped |
| Final card on macOS, a touch screen's lane | facts line ends 4 px short of the close button | |
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
- Underlined heads: they would read as links beside the underlined numbers.
- A long name wrapped with hyphens, or scrolled sideways: the ellipsis matches the table and costs no height.

## Consequences

Supersedes the two popup rules of 2026-09-14 recorded in `popupChrome.ts`: the heading-and-values block (`groupBlock`, `groupValue`, and the `SEPARATOR_COLOR` between values, all removed) and the unbounded height. A new metric family adds one grid line, about 18 px, rather than two. The four-fifths width share in `popupWidth` now holds for every popup but this one.
