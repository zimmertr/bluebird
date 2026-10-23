# 0162. The scale bar stands on the theme's ground, and keeps its 10px label

- Status: Accepted. Amends 0147 (the scale bar no longer keeps the library's look, though it still wears no chrome). Amended by 0174 (in a desk's credit line the scale takes no scrim and draws its ends in its ink) and 0222 (the label is 11px, the floor).
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #739, 2026-10-16: the ground for the scale in both themes, and the 11px floor "only if it measures in a way that doesn't cause word wrapping on mobile", then "or any clipping"
- Issues and PRs: #739, #696, #706, #687
- Cited in code as: #739
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

Record [0147](0147-map-buttons-wear-the-app-chrome.md) moved every button MapLibre draws, and the credit line, onto the app's dark chrome, and kept the scale bar native because it is a ruler on the map, not a control. Its rejected alternative was the app's chrome on the scale. What it did not weigh was a ground that follows the theme without making the ruler a control. With the light theme in (record [0158](0158-light-theme-behind-semantic-tokens.md)), the vendor's white box was the one light piece of chrome on the dark theme, in the corner band beside the dark (i) and under the dark Legend card.

## Decision

- **The scale bar stands on the legend ramp's scrim, in the legend ramp's ink.** `map.css` gives `.maplibregl-ctrl-scale` the recessed surface at 70% (`SWATCH_RAMP_SCRIM`'s token and alpha) and draws its label in the ink (`SWATCH_RAMP_TICK`'s), both read by their `--ui-*` variables, so it is slate-900/70 with slate-200 in the dark theme and white/70 with the light ink in the light theme.
- **Its edge, the ruler's two ends and its foot, is dark in both themes**, because the basemap is light in both: the recessed surface opaque (slate-900) in the dark theme, the ink in the light. The first build drew the edge in the dark theme's light ink, and against the map's light grey the bar lost its ends and read as a plain box.
- **Still a ruler, not a control.** No radius, no shadow, no button, and the vendor's box: its padding, its 20px line, its open top edge.
- **The label keeps the vendor's 10px**, under the app's 11px floor (record [0131](0131-type-scale-floor-and-elevation-scale.md)), because the floor runs the widest label past the bar's end.

## Evidence

Measured 2026-10-16.

Contrast, the ink on the scrim composited over a white map and a black one: 5.35:1 and 15.39:1 in the dark theme, 17.12:1 and 8.16:1 in the light. The edge on a white map: 17.83:1 in the dark theme, 17.12:1 in the light. `styles.test.ts` computes them from `index.css` and Tailwind's palette.

Fit, in Chromium in the Playwright image, every label the map can draw at the narrowest bar it can be drawn on (half `SCALE_MAX_WIDTH_PX` for a leading 1 or 5, three fifths for a 3, two thirds for a 2; `5000 km` no narrower than 64px, since a 512px world spans about 7,800 km in 100px). The label cannot wrap: the library joins the number and the unit with a no-break space. The worst case is `1000 km` on a 50px bar, near zoom 2:

| Font | 10px | 11px |
|---|---|---|
| Liberation Sans (Arial's widths) | 2.6px inside the bar's end | 1.2px past it |
| Roboto | 2.2px inside | 1.7px past |

At 11px `100 km` and `500 km` on a 50px bar stay inside the end, 0.1px (Liberation Sans) and 0.5px (Roboto) into its 5px right padding. `frontend/e2e/scaleBar.spec.ts` holds every label inside the bar at 10px, and the box at 22px tall, in both themes.

## Alternatives rejected

- **The app's chrome on the scale** (`MAP_CREDIT.card` or `MAP_ROUND_BUTTON`): record 0147's reason stands, it would read as a control.
- **Leave the vendor's box:** the one light thing on a dark screen.
- **11px with a narrower padding** was not built: 2px off each side would fit `1000 km`, but it reshapes the ruler to make room for a type size, which the issue did not ask for. It stays open to the maintainer.

## Consequences

The scale follows the theme switch with no script. The 11px floor has one exception on the map, the scale's label, held by a browser test rather than by the type ramp. A future change to the scale's type or padding re-measures in `scaleBar.spec.ts`.
