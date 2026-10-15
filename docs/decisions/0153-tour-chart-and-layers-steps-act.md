# 0153. The tutorial shows the chart's readout moving, and a phone's Layers card switches a layer on

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md) and [0150](0150-tour-opens-the-results-at-rest.md)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14; the Chart card's words approved the same day
- Issues and PRs: #696, #708, #536, #336
- Cited in code as: #696
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet; [`docs/USAGE.md`](../USAGE.md), Tutorial

## Context

The tour pointed at the results sheet and never at the chart, whose hour readout a finger reads (record 0144), so a reader met the chart's most useful gesture by accident. On a phone the Layers card lit the chip and nothing else: the menu is a sheet there, and a list of switches says nothing about what a switch does to the map.

## Decision

- **A Chart card after Results**, in the maintainer's words: "Switch to the chart to compare every destination's forecast hour by hour. Select an hour to read every value at that moment." It opens the sheet to the chart at rest (`restView`, as 0150 opens it to the table) and lights the chart, picker and plot.
- **A drawn pointer crosses the plot** from the plotting band's left edge to its right over two seconds (`CHART_SWEEP_MS`), and the readout walks the demonstration's hours with it, every destination's value at each hour, stopping on the last. The pointer is the overlay's own glyph (`TOUR.pointer`), never a cursor, moved by a transform keyframe so the compositor runs it; the hour changes a dozen times, not once a frame. Under a reduced-motion setting there is no sweep: the pointer and the readout stand on the last hour at once.
- **The sheet stays in the chart** when the step ends, the way the Results step leaves the table open.
- **A phone's Layers card opens the Layers sheet** (held open behind the card, which keeps the keyboard) **and switches Wildfires on** for its length, then off when the card moves on, by any route; a layer the reader already had on is left alone. Wildfires because it is drawn from the pod's own national snapshot, which the Wildfire column already asks for whenever there is a report, so the step asks no third party for anything; the radar, smoke and snow layers are third-party tiles, and the forecast grid spends Open-Meteo calls. Nothing guarantees a fire in view, and a view with none shows the sheet's switch turning on and no change on the map.

## Evidence

`useTour.test.tsx` holds the Results step asking for the table and the Chart step for the chart, and the Layers step switching the layer on and off and leaving a reader's own alone. `tourSteps.test.ts` holds the eight steps, the Chart anchor on one component and its approved words. The browser suite walks the eight cards.

## Consequences

The tour now changes two things while it runs, the sheet's view and one layer, and leaves one: the results stay open in the chart.
