# 0112. Every colour value and popup style has an owning module, and the linter reaches the four channels the stylesheet never sees

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), choosing the issue's option B (audit, centralize, extend the guardrail) on 2026-10-06
- Issues and PRs: #365, #167, #379
- Cited in code as: #365
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the "Style through the design system" rule; [`docs/STYLES.md`](../STYLES.md), "The four channels the stylesheet never sees"

## Context

The hue ban #167 installed (record 0009) matches Tailwind utilities, and a Tailwind utility is not the only way pixels reach the screen. Four channels bypass the stylesheet: MapLibre `paint` and `layout` objects, canvas 2D drawing, popup HTML handed to `setHTML`, and Recharts props. Measured on 2026-09-14 at commit `37149bf` and again on 2026-10-06 at `3232483`: `#3b82f6` (blue-500, which fails the hue ban as `bg-blue-500`) sat in the pending marker's paint; the result marker and the pending dot spelled one recipe twice; three popup buttons in three files wore three near-identical inline styles while `styles.ts` exported `BUTTON_DANGER` beside them; `font-size:13px` was in five files; `#94a3b8` was spelled four times in the chart and once more in its hook; and seven camera moves carried unnamed durations.

## Decision

- Every colour value is written in a module that owns it and composed everywhere else. The owners, each for a stated reason: `styles.ts`, `utils/colors.ts`, `utils/chartColors.ts`, `utils/resultFeatures.ts`, `utils/popupChrome.ts`, `map/mapStyles.ts`, `map/basemap.ts`, the four overlay modules (`utils/wildfires.ts`, `utils/smoke.ts`, `utils/closures.ts`, `utils/snowDepth.ts`), `utils/radar.ts`, `iconPaths.ts` and `logo.ts`.
- `map/mapStyles.ts` is new and owns the app's OWN map objects: the marker recipe (spread into the result and pending layers), the label recipe, the rank digit, the ring and its two handles, the wind arrow's two inks, the camera durations (`CAMERA_MS.fit`/`focus`/`reveal`) and the two fit paddings. The overlays are deliberately not in it: each overlay's pure module already feeds its map layer and its legend swatch from one constant, and the basemap's label and trail colours match OpenFreeMap's terrain rather than the app's palette.
- `utils/popupChrome.ts` owns the popup's type ramp (`POPUP_TITLE_SIZE`, `POPUP_BODY_SIZE`, `POPUP_FINE_SIZE`, `POPUP_FACE`), its rule, label, link, glyph, fine-print and warning colours, and one button recipe in three variants (`popupButton`). `utils/chartColors.ts` owns the chart's axis, grid and playhead colours beside its line palette.
- Three ESLint checks hold it (record 0043 puts a pattern ban in the linter rather than in `styles.test.ts`): `value-hex` bans a hex or `rgb()` value in any string under `src/` outside the owners; `value-inline-style` bans `font-size:`, `padding:`, `border-radius:` and `background:` outside `popupChrome.ts`; `map-paint-named` bans a numeric literal under a paint or layout key in `map/*.ts` outside `mapStyles.ts` and `basemap.ts`. Each has a fixture the self-test lints.
- On the backend, `test_timeouts.py` fails an `httpx.AsyncClient` built with a bare numeric timeout; `geocode.py` had already named its constant by the time this landed.

## Evidence

The move changed no pixel. Every value kept its number and was given a name where it already lived or in the owner nearest to it; the three colours that sit under WCAG AA on a popup's white (`FINE_COLOR` 2.98:1, `LINK_ICON_COLOR` 2.1:1, `WARNING_COLOR` about 2.2:1) were named with their measurement rather than recoloured, because a colour decision is the maintainer's and this work moves values. The first run of `value-hex` over the whole of `src/` found five sites the issue's audit had not: the wind arrow's two canvas inks and the amber on three popup warning lines. Both suites and the linter pass inside Docker.

## Alternatives rejected

- Option A, audit only and file one issue per finding: nothing stops the next copy, and the audit repeats.
- Option C, rewrite the map and popup rendering onto one token file: rewrites the largest component for a small gain over B.
- Widening `styles.test.ts`'s source glob and scanning text, as the issue first proposed: record 0043 had since settled that a pattern over literals belongs in the linter, where it speaks in the editor and cannot mistake a comment for a value.
- One `mapStyles.ts` for every overlay's paint as well: it would part each overlay's fill from the popup and swatch that already read it, and the duplication the issue found was between the app's own markers, not between overlays.
