# 0267. The tutorial shows the chart's panels, its layout menu and two pinned hours

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md) and [0153](0153-tour-chart-and-layers-steps-act.md)
- Date: 2026-11-03
- Decider: the maintainer (TJ), on issue #850, 2026-11-03: option A of three, the four-panel demonstration and the three cards' words. The desk's taller chart, the card that keeps off the panels and the two cards one over the other are Claude's, from the arithmetic below, for review on the PR.
- Issues and PRs: #850, #828, #847, #696, #536
- Cited in code as: #850
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`, `ChartLayoutButton.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`docs/USAGE.md`](../USAGE.md), Tutorial

## Context

The Chart card (record 0153) was written on 2026-10-14 for a chart with one plot. PR #828 gave the chart up to four panels, added with the `+`, a Panel layout button after it at a desk, and pinned cards, where a click at a desk pins that hour's values as a card and each further click pins another beside it. PR #847 gave each panel a title. The tutorial named none of it, so a reader finished it knowing the chart as one plot with a hover readout.

A phone stacks every count of panels in one column and never draws the layout button, and a phone pins nothing: its reading lasts only while a finger rests. Two of the three things have no target there.

## Decision

- **Three cards after Chart, before Markers**, in the maintainer's words:
  - Panels: "Add a panel to chart another metric, up to four. Each one reads the same hours, so the metrics line up for comparison."
  - Panel layout: "Pick a layout to arrange the panels. Drag the gap between two panels to resize them, or double-press it to even them out."
  - Pinned hours: "Select an hour to pin its reading as a card you can move, size and sort. Pin more hours to compare them side by side."
- **Panels runs at both widths over four panels**: the demonstration's ranked metric and what three presses of the `+` add to it (`addMetric` three times on `metricsFor`), so air quality, cloud deck, freezing level and precipitation, in the count's own layout, 1 over 3 at a desk. The light frames the row that holds the `+`: a desk's picker row, or a phone's first panel's picker and `+`, one element at either width. A phone holds its sheet at the full stop for it as for the Chart card, and the readout stays on the middle hour.
- **The card keeps off the panels** (`keepClear` on the step). A card placed beside the row alone stood below it, over the panels the card is about. It is placed as if the light framed the whole chart, so it stands above the chart over the map, where the Chart card stands. The light still frames the row alone.
- **Panel layout runs at a desk only**, with the menu held open (`forcedOpen` on `ChartLayoutButton`, as the Layers card holds its menu) and the light over the button and the menu. The menu leaves the keyboard on the tour's card, and goes when the card is left by any route.
- **Pinned hours runs at a desk only**, with two hours a quarter of the window in from either end pinned as cards, the 4th and the 10th of the demonstration's 13. Each is placed as a click there places its card: at the hour's pixel on the first panel, right of the line in the plot's left half and left of it in the right half, inside the panels' area as measured. No hover card stands on screen to take a height from, so each takes half the area less the gaps, up to the hover card's own height for every line, and the first stands at the area's head and the second at its foot. They stand on a layer the chart's size, which is the card's anchor, and go when the card is left by any route.
- **Neither of the last two stands the readout on the middle hour.** The hover card there stood under the open menu and between the two pinned cards, a third card about the same hours.
- **A desk's chart stands taller for the three cards**, at 440px (`TALL_CHART_PX`, two resting panels) or as tall as a reader's own drag could make it on a shorter window, and goes back to the reader's height after. At rest the chart takes what the docked map floor (541px with two grips) leaves, which on a 780px window is under the panels' 120px floor, so it stands at 120. Less the 30px picker row, 1 over 3 then has two rows of about 41px against a 72px floor per panel, and no panel is drawn.
- **A step can be a desk's alone** (`deskOnly`), and `start` leaves those out on a phone: twelve cards at a desk, ten on a phone.
- **The reader's own chart is untouched.** The four metrics replace the reader's only in the prop the chart is handed, so the address bar keeps writing the reader's own `chart=` and `layout=`, never the demonstration's. The reader's own pins stand aside while the demonstration is up and come back with their own hours: before this the demonstration's hours replacing theirs dropped them at the first chart card. Escape under the tour ends the tour and lets none of them go.

## Evidence

Computed from the layout constants rather than measured in a browser: the chart is 920px wide at 1280px, and a pinned card with four metric columns about 570px, so two cards side by side at their hours overlap; one over the other they cannot, at any width. At 1280x720 the held chart is 320px (720 less the 120px table floor less the drag's 280px map), and each card about 133px tall.

`tourSteps.test.ts` holds the twelve steps, each new anchor on one control in one component and the approved words. `useTour.test.tsx` holds the four metrics on the three cards alone, the held menu on its card alone, the two pinned hours, the readout off on the last two, and a phone's tour without the two desk cards. `TimeSeriesChart.test.tsx` holds the anchor on the row with the `+` at both widths, the held menu, the two cards at the area's head and foot beside their hours, their going, and the reader's own pins set aside and given back. `ChartLayoutButton.test.tsx` holds `forcedOpen`, `Tour.test.tsx` the card kept clear, and `useResultsLayout.test.tsx` the desk's taller chart. The browser suite walks twelve cards at a desk and ten on a phone, finds four drawn panels on the Panels card, the menu open on the next, two cards inside the chart and clear of each other on the next, and no `chart=` or `layout=` in the address bar on any card.

## Alternatives rejected

- **One card for all three** (option B): three sentences over one framing, and the reader never sees the menu or a pinned card.
- **Rewording the Chart card** (option C): its words are approved and say what they should, and it would still show one plot.
- **Lighting the whole chart on the Panels card**: the issue's open question. The `+` is the control and the panels are what it gives, so the light keeps the row and the card keeps off the panels instead.
- **Two pinned cards side by side**: see the arithmetic above.
- **Pinning on a phone**: a phone pins nothing, so that is a chart change first.

## Consequences

The tour now changes three things while it runs, the sheet's view, one layer on a phone and a desk's chart height for three cards, and still leaves one: the results stay open in the chart.
