# 0228. Chart lines are ColorBrewer Set1 in twenty shades, with no rim, and hairlines past thirty

- Status: Accepted. Supersedes 0158's chart-line clause (light pastels over a rim). Amends 0211: no mark in a line's colour wears the `line-edge` token, which is gone.
- Date: 2026-10-27. The palette and the line settings were chosen on 2026-10-22, the colour order and the light fit on 2026-10-27.
- Decider: the maintainer (TJ), on #801, in the Chart Palette Lab, an interactive page drawing forty-two palettes on a fake hundred-line forecast, every setting live. TJ chose ColorBrewer Set1 at twenty colours with the settings below, and then, from a second page, palette order over the lab's spread, and the light theme darkened to 3:1.
- Issues and PRs: #801, #802
- Cited in code as: #801
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartColors.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx` and `ResultsTableRow.tsx`; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), `index.css`; [`docs/STYLES.md`](../STYLES.md), The chart and Chart lines; [`docs/USAGE.md`](../USAGE.md), the light theme and the model comparison

## Context

Since PR #733 the light theme drew its chart lines as Tailwind 300 pastels, each over a 1px rim of `ink-soft`, because a pastel reads 1.16 to 1.62:1 on the light panel and a line owes its ground 3:1 (WCAG 1.4.11). The maintainer found the light lines off: the dark border made the contrast look wrong (#801). Dark drew Tailwind's 400 steps with no rim.

Three rounds of static mockups each missed. Ten hues at one OKLCH lightness per theme cleared 3:1 everywhere but read as pastel neon on a hundred-line chart in dark. Tableau 10 with every line past ten faded to 55% sank Tableau's darker colours into the slate and left its yellow and orange: "It should still be more colorful." A round of vivid sets at full strength came close, and the maintainer asked for the knobs instead: "Make the artifact interactable."

The Chart Palette Lab drew forty-two palettes, from the app's own Tailwind hues through Tableau, Observable, Google, Apple, IBM, Okabe-Ito and the rest, on one fake forecast shaped like a crowded chart, with the colour count, how a palette extends past its own colours, the colour order, saturation, lightness and hue, the crowded boundary and the width and opacity on either side of it, curve, dots, edges, draw order, blend, focus and theme all live. The maintainer hid forty-one and kept Set1.

## Decision

- The palette is ColorBrewer Set1 in twenty shades, the lab's own output: Brewer's nine strong primaries, then a lighter shade of each, then a darker shade of the first two, every one turned five degrees of hue toward red. The twenty repeat past the twentieth line.
- Dark is that output untouched. Light makes the darker shades first, as the lab does on a light ground, and the eight of its twenty that fell under 3:1 on the light panel drop in OKLCH lightness alone, hue and chroma kept, until they clear it. Brewer's yellow, 1.04:1 on the light panel, lands at a gold.
- Colours go out in palette order, so lines 1 to 9 take the nine primaries. The lab's "spread apart" order would have handed lines 1 to 3 red, light red and dark red; it looked the same at a hundred lines because every colour was on screen.
- Up to thirty lines each is 1px; past thirty each is a 0.5px hairline. Every line is full strength at any count. A focused line stands at 2.5px, and the rest fall to half while it does.
- No rim. The SVG filter, `LINE_EDGE`, the `line-edge` token, the light hover dot's rule and `CHROME.lineEdge` are gone. A point sample's dot, a readout swatch, a legend dot and a ticked chart box each show their colour alone.
- The lines go back to Recharts' own line layer, and the extreme line draws after them in it, as before PR #733.

## Evidence

Set1 as published: `e41a1c 377eb8 4daf4a 984ea3 ff7f00 ffff33 a65628 f781bf 999999`, checked against D3's source on 2026-10-27.

Measured 2026-10-27 with the lab's maths against the light panel, `#eef2f9`, and slate-800, `#1d293d`:

| | Light | Dark |
|---|---|---|
| The twenty, as shipped | 3.01 to 7.21:1, none under 3 | 2.13 to 13.48:1, four under 3 |
| The eight darkened in light, before | 1.04 to 2.73:1 | |

The four under 3:1 in dark are the two darkest shades (2.13, 2.21), purple (2.76) and brown (2.77), which the maintainer accepted: "As long as we are following Tableau's lead here, a well established software company, I can accept the rotating 10 colors and possible accessibility contrast concerns."

`chartColors.test.ts` pins all forty hexes and both spans, and `chartLines.spec.ts` checks in a browser that every drawn line in a short chart resolves to a colour of its own that clears 3:1 in light, with no filter over the lines.

The lab's settings file, exported 2026-10-23: 20 colours, shades past the palette's own, hue −5°, crowded past 30, 1px and 0.5px, 100% opacity on both sides, straight lines, no dots, no edge, rank 1 drawn under, normal blend, hover at 2.5px with the rest at 50%.

## Alternatives rejected

- **One OKLCH lightness per theme** (the first palette on this branch): every line cleared 3:1, and a hundred of them in dark read as pastel neon.
- **Tableau 10, faded to 55% past ten lines** (the second): the fade left the chart yellow and orange.
- **The lab's spread-apart order**: three reds on a three-line chart.
- **The light set as the lab draws it**: Brewer's yellow at 1.04:1 cannot be seen on the light panel.
- **Darkening only the two yellows**: pink, orange, green, grey and the two dark shades would have stayed at 2.1 to 2.7:1.
- The thirty-nine other palettes mocked in round one and the lab, from a charcoal rim in each line's own shade to Turbo.

## Consequences

- Past twenty lines two lines can share a colour, the model comparison's included. The hover box and the focused line's emphasis tell them apart.
- A crowded chart's hairlines are 0.5px: crisp on a high-density screen, a faint 1px on a low one.
- `chartRim.spec.ts` is gone. It existed because the rim's rule named a group Recharts creates, which a Recharts release could rename. The lines now depend on no Recharts class.
- A new mark in a line's colour needs nothing drawn round it.
- A chart palette is judged in a lab, in both themes, at a few lines and at a hundred, before it ships.
