# 0163. The map popups follow the theme: dark cards in the dark theme, white in the light

- Status: Proposed, on PR for #740. Supersedes the popup clause of 0158 once accepted.
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #740, whose option B this builds; the dark palette is the PR's proposal and awaits the same call
- Issues and PRs: #740, #738, #741, #706, #739
- Cited in code as: #740
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupChrome.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Two themes; [`docs/USAGE.md`](../USAGE.md), Light theme

## Context

Record [0158](0158-light-theme-behind-semantic-tokens.md) kept the popups out of the theme: "the popups are MapLibre's white cards". `map.css` held a popup to the light scheme, and every colour inside a card was a hex in `popupChrome.ts` measured against white. In the dark theme that made the card the brightest thing on screen, flashing white over the dark panel on every click. Since #738 every popup is one card with one frame class, so one switch reaches the destination, basemap-feature, wildfire, closure and smoke cards together. Record [0162](0162-scale-bar-on-the-theme-ground.md) had just moved the scale bar, the other light piece of map chrome, onto the theme's ground.

## Decision

- **Every colour a card wears is a `--popup-*` value, declared once per theme in `map.css`.** `popupChrome.ts` names them in its markup (`var(--popup-label)`), which resolves where the markup lands; `map.css` names them for the parts MapLibre draws, the card's surface, its tip, the close button and the scroll bar. They sit in `map.css` rather than `index.css`, which every page loads, because only the map draws a popup.
- **The light card is unchanged.** Its values are the hexes it always painted, so the light theme is pixel-identical.
- **The dark card is the panel's own.** Its surface is `panel`, the surface every popover stands on; its header band and grid columns are halfway between `panel` and `raised` in oklab; its ranked cell is `raised`; its ink, label and fine print are the panel's `ink`, `ink-soft` and `ink-faint`; its links and link-out glyph are `accent-ink`; its lines are `rule` and `frame`; its primary button is the accent fill. Each is a `--ui-*` token, so the card cannot drift from the panel beside it.
- **The warning amber stays amber-500 in both themes.** It is the maintainer's choice on white (2026-10-08), and on the dark card it clears AA.
- **The ring's remove-point popup follows too.** It is the one popup that is not a card, a bare button, and it stands on the same surface.

## Evidence

Measured 2026-10-16 in `styles.test.ts`, from `map.css`, `index.css` and Tailwind's palette.

| Pair, dark card | Ratio | Light card |
|---|---|---|
| Ink on surface, band, ranked cell | 11.86, 10.05, 8.40 | 21.00, 19.17, 17.03 |
| Label on surface, band | 5.56, 4.71 | 7.58, 6.92 |
| Link on surface, band, ranked cell | 6.71, 5.69, 4.75 | 5.93, 5.42, 4.81 |
| Link-out glyph on band | 5.69 | 3.74 |
| Warning on surface | 6.81 | 2.15 |
| Fine print on surface, band | 3.07, 2.60 | 2.98, 2.34 |
| Band on surface, ranked cell on band | 1.18, 1.20 | 1.10, 1.13 |
| Primary, secondary, danger label on fill | 4.56, 6.15, 3.76 | 4.10, 8.40, 3.76 |
| Scroll thumb on band | 4.71 | 4.34 |

Every dark text clears 4.5:1 and every icon 3:1, except the fine print, which steps back as far as the light card's does, and the danger button, which is unchanged in both. The band and the ranked cell part from the dark surface about as far as the light ones do from white. The browser suite's axe run now opens a result card in each theme and finds nothing serious. Screenshots of all five cards in both themes, at a desk and on a phone, are on the PR.

## Alternatives rejected

- **A, white cards in both themes:** the flash on every click in the dark theme, which is the issue.
- **C, dark cards in both themes:** in the light theme a dark card over a light map is the same flash inverted.
- **A darker card, `recessed` under a `panel` band:** every pair passes with more room, but the card was the darkest surface in the app, a step under every popover beside it.
- **The `raised` step for the band:** the panel's soft ink falls to 4.04:1 on it.

## Consequences

A new colour in a card is a `--popup-*` pair in `map.css` and a measured pair in `styles.test.ts`, not a hex in `popupChrome.ts`. The tip of a card anchored below its point stands against the band rather than the surface, a 1.18:1 seam in the dark theme where the light one has the same seam at 1.10:1.
