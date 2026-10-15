# 0150. The tutorial's results step opens the results sheet at rest, and leaves it open

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md). Amended by [0153](0153-tour-chart-and-layers-steps-act.md) (the Chart step opens it to the chart the same way)
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14
- Issues and PRs: #696, #708, #536
- Cited in code as: #696
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet

## Context

A row tap on a phone drops the results sheet to its bar so the popup it opens has the map (record [0143](0143-row-opens-its-popup.md)). A reader who did that and then ran the tutorial met its Results step over a sheet at its bar: the spotlight lit a strip and the card described a table nobody could see. Record 0066 has the tour change nothing in the app; it moves the drawer, the Layers menu and the camera, and puts the drawer and the camera back when it ends.

## Decision

- **Before the Results step's spotlight is drawn, the sheet opens to its resting height in Table view**, the reverse of the row tap's collapse: the collapse chevron's state goes open, and on a phone the panel heights go back to the resting default and the mode to Table, the shape a first report opens in. A desk only opens its docked results and keeps their mode.
- **It is set as state, not held as an override**, so the sheet stays where the step put it when the step ends: the marker step after it still lowers it to its bar for its popup (the existing override), and the end of the tour leaves it open. This is the one thing the tour leaves changed, and it is a layout, not a choice: the mode it sets is not stored, so a mode the reader pressed is still the one a later visit opens in.
- **A layout effect** (`restView` in `useResultsLayout`, the view to open to), so the open sheet is drawn in the commit the step opens in, and the tour's spotlight, which measures before every paint, never frames the bar first.

## Evidence

`useResultsLayout.test.tsx` holds a phone sheet that was collapsed, dragged and put on Chart coming back open, in Table, at its resting height, with the stored mode unchanged, and staying so when the request ends; and a desk's results opening with their mode kept. `useTour.test.tsx` holds that only the Results step asks for the table (and the Chart step, by 0153, for the chart). The browser suite opens the tutorial over a collapsed phone sheet and finds it open at the Results step and after the tour ends.

## Consequences

The tour no longer leaves the app exactly as it found it: a sheet the reader had collapsed is open afterwards. The maintainer asked for that.
