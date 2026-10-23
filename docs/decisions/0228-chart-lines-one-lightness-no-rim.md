# 0228. Every chart line is one OKLCH lightness per theme, and wears no rim

- Status: Accepted. Supersedes 0158's chart-line clause (light pastels over a rim). Amends 0211: no mark in a line's colour wears the `line-edge` token, which is gone.
- Date: 2026-10-22
- Decider: the maintainer (TJ), on #801, choosing A from ten palettes drawn side by side on the real chart in both themes. The brief: lines that "look pretty, elegant, and easily differentiatable to the user. In both dark and light mode", with web design standards first.
- Issues and PRs: #801, #802
- Cited in code as: #801
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartColors.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx` and `ResultsTableRow.tsx`; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `index.css`; [`docs/STYLES.md`](../STYLES.md), The chart and Chart lines

## Context

Since PR #733 the light theme drew its chart lines as Tailwind 300 pastels, each over a 1px rim of `ink-soft`, because a pastel reads 1.16 to 1.62:1 on the light panel and a line owes its ground 3:1 (WCAG 1.4.11). The maintainer found the dark lines good and the light ones off: the dark border made the contrast look wrong (#801). Dark drew Tailwind's 400 steps with no rim.

Two rounds of mockups came first. One kept a rim in each line's own darker shade, or dropped the rim for darker colours. The other tried saturated brights, with and without a glow. The maintainer turned the brights down: no glow, no pastels, nothing dull, and no yellow inside black outlines. The third round drew ten palettes on the chart with ten lines each, in both themes, every swatch marked with its ratio against the panel.

## Decision

- Every line, curated or generated, is drawn at one OKLCH lightness per theme: 0.61 in light and 0.75 in dark. Chroma is capped at 0.16 in light and 0.15 in dark, and drops wherever sRGB cannot show the cap.
- The first ten sit at fixed hues, in allocation order: blue, red, green, purple, orange, teal, pink, gold, indigo and olive. Light's gold is ten degrees warmer than dark's. From the eleventh on, the hue walks the golden angle from the first.
- No rim. The SVG filter, `LINE_EDGE`, the `line-edge` token, the light hover dot's rule and `CHROME.lineEdge` are gone. A point sample's dot, a readout swatch, a legend dot and a ticked chart box each show their colour alone.
- The lines go back to Recharts' own line layer. The extreme line shares it and draws after them, as it did before PR #733.

## Evidence

Measured 2026-10-22 against the light panel, `#eef2f9`, and slate-800, `#1d293d`. These are the published palettes as their makers ship them:

| Palette | Lines under 3:1, light | Lines under 3:1, dark |
|---|---|---|
| A (this record) | 0 of 10 | 0 of 10 |
| IBM Carbon | 6 of 14 | 4 of 14 |
| Tableau 10 | 6 of 10 | 0 of 10 |
| Observable 10 | 7 of 10 | 1 of 10 |
| Okabe-Ito | 4 of 8 | 1 of 8 |
| D3 category10 | 4 of 10 | 2 of 10 |
| Google Charts | 3 of 10 | 4 of 10 |
| Highcharts | 7 of 10 | 1 of 10 |
| ColorBrewer (Dark2 light, Set2 dark) | 2 of 8 | 0 of 8 |
| Apple system colours | 6 of 12 | 1 of 12 |

The Apple values were written from memory of Apple's guidelines rather than read off a published page.

A's curated ten read 3.13 to 3.68:1 in light and 6.11 to 6.96:1 in dark. The first thousand allocator slots read 3.13 to 3.70:1 in light and 6.10 to 7.05:1 in dark. At light 0.62 the worst hue reads 3.01:1, too close to round on. `chartColors.test.ts` pins every one of these numbers, and `chartLines.spec.ts` checks in a browser that every drawn line clears 3:1 in each theme with no filter over the lines.

## Alternatives rejected

- **A rim in each line's own darker shade** (mockup C): the same filter as before, with the outline in the line's hue rather than charcoal. Passed over.
- **Darker colours with no rim** (mockup D): its ten read 3.16 to 4.48:1, amber landed close to orange, and past the tenth the walk had to drop to HSL lightness 33 to clear 3:1. The maintainer leaned toward it, asked to see more, and chose A.
- **Saturated brights, with or without a glow** (mockups E, F and G): turned down by the maintainer.
- **Every published palette in the table above**: each puts at least one line under 3:1 in one theme or the other on these panels. Most were tuned for a white page.

## Consequences

- `chartColors.ts` paints every colour from its hue with one OKLCH conversion and keeps each answer, so a long chart's renders read the same strings.
- `chartRim.spec.ts` is gone. It existed because the rim's rule named a group Recharts creates, which a Recharts release could rename. The lines now depend on no Recharts class.
- A new mark in a line's colour needs nothing drawn round it.
