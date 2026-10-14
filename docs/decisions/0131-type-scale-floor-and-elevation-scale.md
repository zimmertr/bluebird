# 0131. The type ramp has an 11px floor, nothing pressed reads under 12px, and every shadow is one of three steps

- Status: Accepted
- Date: 2026-10-13, recorded with the change that ships it
- Decider: the maintainer (TJ), accepting rows S01 and S02 of the #687 visual audit
- Issues and PRs: #687, #390, #437, #360, #365, #699
- Cited in code as: #687
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Style through the design system; [`docs/STYLES.md`](../STYLES.md), The type floor and The elevation scale

## Context

The #687 audit read every size and every shadow the app draws. Two things had no rule behind them.

- **Type.** `MICRO_SIZE` was 10px and nine places wore it, among them the calendar's weekday row, the player's marks, the model picker's reach column, the chart's ticks and the Restore buttons in the Removed list. At 10px the weekday row and the marks under the player read as a smudge, and the Restore buttons were the one press in the app below 12px. The dialog heading (`PROSE.title`) was a step off the panel's own name for no stated reason.
- **Shadows.** Five shadow sizes on eight surfaces, from `shadow` on the range thumbs to `shadow-2xl` on the Layers popover, with the column ghost spelling its own `shadow-xl` and the phone's results sheet casting one down onto nothing.

The same pass found roles that were parts of one thing exported as separate names (`DRAG_GRIP`, `DRAG_GRIP_ACTIVE`, `CARRIED`, `DRAG_GHOST`, `DRAG_INSERT`; four `SLIDER_*` and `SCRUBBER_TRACK`; `MAP_COL_GAP` and `MAP_COL_GAP_T`), two exported roles nothing outside `styles.ts` composed (`RECESSED_EDGE`, `TRANSPORT_AXIS_W`), and `PANEL_RULE` spelling the quiet rule as half-opacity slate-600 where `SURFACE_DIVIDER` spells it as slate-700, the same line to the eye by arithmetic alone.

## Decision

- **`MICRO_SIZE` is 11px**, the floor for text a reader reads. `MAP_EDGE.publish` carries it to MapLibre's credit line and `CHART_TICK_PX` to the chart, whose tick labels and chrome labels (`Now`, a model's end, the extreme value) all take it.
- **12px (`TEXT.control`) is the floor for anything pressed.** No button or link wears `TEXT.micro`; the linter's `style-micro-not-pressed` check fails one. The Restore buttons read at `CONTROL_SIZE`. A credit keeps the micro step, because attribution is the step's own job: MapLibre's attribution line on the map, which carries the Open-Meteo link.
- **One size stays under the floor**: `GLYPH_SIZE`, 10px and private to `styles.ts`, for a glyph inside a box something else sizes. The legend strip's numerals in their scrim band and the smoke key's letters, whose chips grew to 16px squares to hold them.
- **`PROSE.title` is `TEXT.appTitle`'s 18px**, so a dialog names things at the panel's size.
- **Every shadow is a step of `ELEVATION`**: `none` for what stands on an edge (the results sheet, the preview banner, the range thumbs), `raised` (`shadow-lg`) for what rests on the map and is read past, `overlay` (`shadow-2xl`) for what opens above other chrome and is closed again, which is every menu, every card over a scrim and a column being carried. `styles.test.ts` fails a shadow off the scale in any role and any stock shadow utility in a component. The glows (`ACCENT_RING`, the tutorial's spotlight) are not depths and stay off it.
- **Parts of one thing are one object**: `DRAG`, `SLIDER` and `MAP_COL_GAP`. `RECESSED_EDGE` and `TRANSPORT_AXIS_W` are private to `styles.ts`. `PANEL_RULE` draws `SURFACE_DIVIDER`'s slate-700, and `styles.test.ts` holds the two to one colour.

## Evidence

- Measured 2026-10-13 against images built from `main` and from this change, at 1440x900 in Chromium (Playwright 1.63): no model picker option overflows at 11px, the chart's 11px ticks fit its 44px `Y_AXIS_WIDTH` (`40` is the widest), and the weekday row and the player's marks hold their columns.
- `PANEL_RULE`'s move is a pixel change on the panel's section rules: 1.37:1 against slate-800 before, 1.41:1 after, the same two figures as the three-weights table in `STYLES.md`.
- The chart's chrome moved to Tailwind v4's own hexes in the same change (`CHART_AXIS_COLOR` `#90a1b9`, `CHART_GRID_COLOR` `#314158`, `CHART_PLAYHEAD_COLOR` `#00bcff`, `CHART_SURFACE_COLOR` `#1d293d`), and the map label halo in `mapStyles.ts` to `#0f172b`, so a Recharts prop and a class name paint one slate. The chrome label's halo contrast, which [0126](0126-chart-marks-the-extreme-hour.md) measured at 5.71:1 on the v3 hexes, is 5.56:1 on these, still over the 4.5:1 text owes; `chartColors.test.ts` pins it.

## Alternatives rejected

- 12px as the floor for everything: the calendar's weekday row and the player's marks are labels in columns whose widths something else decides, and 12px would have crowded both for text that is never first.
- Keeping five shadow sizes and naming each: names without a rule for which surface gets which are the same five sizes with longer spellings.
- `shadow-xl` for the top step: `SURFACE_POPOVER` had already measured it against `2xl`, and only the 0.25-alpha blur of `2xl` still reads over the dark results sheet.

## Consequences

The ramp's smallest step moved by a pixel everywhere it is used, so the places named above were re-measured, and a new use of `TEXT.micro` on a button fails the linter rather than review. A surface added later picks a step of `ELEVATION` rather than a size. Callers of the merged roles read `DRAG.ghost`, `SLIDER.track` and `MAP_COL_GAP.gap` where they read a flat name, and the linter's checks that named the old exports name the members.
