# 0153. The tutorial shows the chart's readout on an hour, and a phone's Layers card switches a layer on

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md) and [0150](0150-tour-opens-the-results-at-rest.md)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14; the Chart card's words approved the same day
- Issues and PRs: #696, #708, #536, #336
- Cited in code as: #696
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet; [`docs/USAGE.md`](../USAGE.md), Tutorial

## Context

The tour pointed at the results sheet and never at the chart, whose hour readout a finger reads (record 0144), so a reader met the chart's most useful gesture by accident. On a phone the Layers card lit the chip and nothing else: the menu is a sheet there, and a list of switches says nothing about what a switch does to the map.

## Decision

- **A Chart card after Results**, in the maintainer's words: "Switch to the chart to compare every destination's forecast hour by hour. Select an hour to read every value at that moment." It opens the sheet to the chart (`restView`, as 0150 opens it to the table), holds a phone's sheet at its full stop for its length (`fullOverride`, record 0154), so the five-line readout stands inside the plot beside the lines it reads, and lights the chart, picker and plot.
- **The readout stands on the window's middle hour**, the demonstration's seventh of thirteen, exactly as a resting finger or mouse shows it: the vertical line, a dot on every destination's line and every value at that hour. The tour picks the hour (`useTour`) and hands it to the chart through the same index a finger's reading takes (`tooltipIndex`), so nothing synthesises a pointer event and nothing is drawn over the plot. No pointer glyph and no animation: a first build swept a drawn pointer across the plot over two seconds with the readout walking the hours, and the maintainer dropped it the same day for a still of the state a reader reaches by touching the chart.
- **The sheet stays in the chart** when the step ends, the way the Results step leaves the table open, **and the readout goes with the tour**: a reader who ends it on the Chart card sees their own lines. A build that kept the readout standing over the reader's own report was dropped the same day, because over a ten-row report it was a box taller than the plot that hid every line (frame `r8-390-tour-after`, 2026-10-14).
- **A phone's Layers card opens the Layers sheet** (held open behind the card, which keeps the keyboard) **and switches Wildfires on** for its length, then off when the card moves on, by any route; a layer the reader already had on is left alone. Wildfires because it is drawn from the pod's own national snapshot, which the Wildfire column already asks for whenever there is a report, so the step asks no third party for anything; the radar, smoke and snow layers are third-party tiles, and the forecast grid spends Open-Meteo calls. Nothing guarantees a fire in view, and a view with none shows the sheet's switch turning on and no change on the map.
- **Its card stands in the map between the chip and the sheet**, over neither: just under the chip's light, the existing placement's `below`, with the sheet's top edge as a floor it must not cross (`sheetBetween` in `place.ts`). Either edge of the screen put it over one of them, the top edge over the chip, so a reader never saw the control that had opened the sheet. The light still holds both. Measured 2026-10-14: the sheet is already sized to its eight rows (428px, no scroll), the card is 162px, and the band between them is 220px at 360x740, 324 at 390x844, 412 at 430x932 and 207 at 393x727 (Playwright's Pixel 5, the shortest Pixel it lists), leaving 38, 142, 230 and 25px under the card. Below a 714px-tall screen (748 with a 34px home indicator under the sheet) the band cannot hold the card, and it takes the top edge as before.

## Evidence

`useTour.test.tsx` holds the Results step asking for the table and the Chart step for the chart at the full stop, both standing the readout on the demonstration's middle hour and letting go when the tour ends, and the Layers step switching the layer on and off and leaving a reader's own alone. `TimeSeriesChart.test.tsx` holds the chart letting the tour's hour go when the tour ends. `tourSteps.test.ts` holds the eight steps, the Chart anchor on one component and its approved words. The browser suite walks the eight cards, finds the cursor's line on the middle of the plot with a dot on each of the five lines, and, on a phone, ends the tour on the Chart card and finds the chart in place with its lines and no readout.

## Consequences

The tour now changes two things while it runs, the sheet's view and one layer, and leaves one: the results stay open in the chart.
