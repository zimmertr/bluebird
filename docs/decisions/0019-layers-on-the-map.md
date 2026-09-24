# 0019. The overlay switches live in a Layers popover on the map

- Status: Accepted
- Date: 2026-08-04 (the guide: "TJ, 2026-08-04"; git: shipped in #248)
- Decider: TJ, as the guide records (2026-08-04 for the placement; 2026-09-22 for the greyed row)
- Issues and PRs: #246, #248, #249, #460, #461
- Cited in code as: #246, #249, #460
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet from "The style segment lives beside the layer's checkbox"; and [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the paragraph that opens "The popover hangs off a button"

## Context

The overlay toggles change what is looked at, not what is asked for.

## Decision

All five overlay toggles live in a Layers popover on the map, not in the panel, and the Forecast player is a row in the same list (#249 review). The popover hangs off a button under the search box, top left, in the app's own map-control column; MapLibre's controls keep the right. The button wears `BUTTON_FLOATING` like Controls. Every row is in the list every time and greys when it is out of play (#460). A greyed row carries no note. The rows are alphabetical by label. The popover is a menu, so it wears `SURFACE_POPOVER`, and it dismisses on an outside `pointerdown` and on Escape.

## Evidence

The first placement (git: #248, 2026-08-05), under MapLibre's zoom, compass and geolocate stack on the right at a measured offset, clipped the geolocate button: that stack is two control groups with a margin between them, so any offset that clears it is a guess. MapLibre ships a 10px margin, which started its buttons a step above the Layers button; both columns now read one inset, `--map-edge-inset` (12px) (git: #335, 2026-09-14).

## Alternatives rejected

- The toggles in the panel.
- Indenting the layer rows under a heading: tried and reverted. Do not reach for it again.
- The right-hand column under MapLibre's stack: clipped the geolocate button.
- A row that leaves the list when unavailable: switching the radar off took a row out of the middle and moved every row under it (#460).
- A note on a greyed row: a sentence explaining a control is a tooltip by another name (TJ, 2026-09-22).

## Consequences

The linter's `style-map-column` check fails an inset spelled at a call site, and `styles.test.ts` does the same for `map.css`. A `?raw` test in `styles.test.ts` keeps the rows alphabetical. `LIFTED_EDGE` exists because slate-500 has only 2.17:1 against the popover surface (git: #335, 2026-09-14).
