# 0228. Chart lines are Tableau 10 in both themes, with no rim, and thin and fade past ten

- Status: Accepted. Supersedes 0158's chart-line clause (light pastels over a rim). Amends 0211: no mark in a line's colour wears the `line-edge` token, which is gone.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on #801. The brief: lines that look professional and can be told apart, with five lines or a hundred, in both themes, following "how Tableau solves this problem". TJ chose the third treatment below from mockups on the real chart, and accepted the colours repeating past ten, and a crowded line reading under 3:1, "as long as we are following Tableau's lead here".
- Issues and PRs: #801, #802
- Cited in code as: #801
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartColors.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx` and `ResultsTableRow.tsx`; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `index.css`; [`docs/STYLES.md`](../STYLES.md), The chart and Chart lines; [`docs/USAGE.md`](../USAGE.md), the light theme and the model comparison

## Context

Since PR #733 the light theme drew its chart lines as Tailwind 300 pastels, each over a 1px rim of `ink-soft`, because a pastel reads 1.16 to 1.62:1 on the light panel and a line owes its ground 3:1 (WCAG 1.4.11). Dark drew Tailwind's 400 steps with no rim. The maintainer found the light lines off: the dark border made the contrast look wrong (#801).

The first answer was a palette of its own: ten hues at one OKLCH lightness per theme, the only one of ten palettes mocked whose every line cleared 3:1 in both themes. It shipped to the PR #802 preview, where a real chart of a hundred destinations in dark read as a neon pastel mass. It had been judged on ten lines. The maintainer asked for something that holds up crowded as well as with a few lines, and how Tableau does it.

Tableau 10 is ten colours of middling lightness and saturation, built to be told apart and to sit on a light page or a dark one. Tableau repeats them past ten. For a crowded line chart, Tableau's highlight action, the FT and Datawrapper either thin the lines or draw a few in colour over grey context. Three treatments of Tableau 10 were drawn on the real chart, at five lines and at seventy-one, in both themes, on stubbed forecasts:

1. Repeat the ten past ten, every line at 1px.
2. As 1, every line at 55% opacity.
3. The first ten in colour over the rest in one grey at 1px.

## Decision

- Every line takes a Tableau 10 colour by its allocation index, and the colours repeat past the tenth.
- Dark uses Tableau 10 as published. Light darkens the six that fall under 3:1 on the light panel (orange, teal, green, yellow, pink and grey) in OKLCH, hue and chroma kept, only until each clears 3:1.
- Up to ten lines, each is drawn at 1.5px, full strength. Past ten, every line is 1px at 55%, so the repeats blend into one band (treatment 2). A focused line stands at 2.5px, full strength, either way, and the rest dim to a quarter.
- No rim. The SVG filter, `LINE_EDGE`, the `line-edge` token, the light hover dot's rule and `CHROME.lineEdge` are gone. A point sample's dot, a readout swatch, a legend dot and a ticked chart box each show their colour alone.
- The lines go back to Recharts' own line layer. The extreme line shares it and draws after them, as it did before PR #733.

## Evidence

Measured 2026-10-22 against the light panel, `#eef2f9`, and slate-800, `#1d293d`:

| | Light | Dark |
|---|---|---|
| The ten, full strength | 3.04 to 4.05:1 | 3.21 to 9.08:1 |
| The ten at 55%, past ten lines | 1.75 to 2.01:1 | 1.90 to 3.75:1 |
| The six darkened in light | 3.06 to 3.09:1 | |

`chartColors.test.ts` pins every number above. `chartLines.spec.ts` checks in a browser that every drawn line in a short chart resolves to a colour of its own that clears 3:1 in each theme, and that no filter stands over the lines.

The ten published palettes mocked in the first round, against the same panels, lines under 3:1 light and dark: IBM Carbon 6 of 14 and 4 of 14; Tableau 10 6 of 10 and none; Observable 10 7 and 1; Okabe-Ito 4 of 8 and 1; D3 category10 4 and 2; Google Charts 3 and 4; Highcharts 7 and 1; ColorBrewer (Dark2 light, Set2 dark) 2 of 8 and none; Apple system colours 6 of 12 and 1, written from memory of Apple's guidelines rather than read off a published page.

## Alternatives rejected

- **One OKLCH lightness per theme**, ten hand-picked hues and a golden-angle walk past them. Every line cleared 3:1 in both themes, but at a hundred lines in dark it read as pastel neon.
- **A rim in each line's own darker shade**, and **darker colours with no rim**: the first round's C and D. The maintainer leaned toward D and asked to see more.
- **Saturated brights, with or without a glow**: turned down. No glow, no Easter-egg pastels, nothing dull, no yellow inside black outlines.
- **Repeat, thin** (treatment 1): every crowded line keeps 3:1, at the cost of a busier band.
- **Ten in colour over grey context** (treatment 3): the clearest way to follow ten lines through a crowd, but the rest lose their colour in the table and the legend too.

## Consequences

- Past ten lines two lines can share a colour, the model comparison's included. The hover box and the focused line's emphasis are what tell them apart.
- A crowded line reads under 3:1 on its panel. A short chart's lines all clear it.
- `chartRim.spec.ts` is gone. It existed because the rim's rule named a group Recharts creates, which a Recharts release could rename. The lines now depend on no Recharts class.
- A new mark in a line's colour needs nothing drawn round it.
