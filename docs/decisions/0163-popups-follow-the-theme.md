# 0163. The map popups follow the theme: dark cards in the dark theme, white in the light

- Status: Accepted. Amended by 0212: a link underlines on hover and focus, and faintly at rest on touch, and the link-out glyph rests in the label grey. Supersedes the popup clause of 0158.
- Date: 2026-10-16
- Decider: the maintainer (TJ), on PR #744, 2026-10-16: option B of #740, the dark palette, links in the colour of the text around them, and the ranked family in the table's colours
- Issues and PRs: #740, #744, #738, #741, #706, #739
- Cited in code as: #740
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupChrome.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Two themes; [`docs/USAGE.md`](../USAGE.md), Light theme

## Context

Record [0158](0158-light-theme-behind-semantic-tokens.md) kept the popups out of the theme: "the popups are MapLibre's white cards". `map.css` held a popup to the light scheme, and every colour inside a card was a hex in `popupChrome.ts` measured against white. In the dark theme that made the card the brightest thing on screen, flashing white over the dark panel on every click. Since #738 every popup is one card with one frame class, so one switch reaches the destination, basemap-feature, wildfire, closure and smoke cards together. Record [0162](0162-scale-bar-on-the-theme-ground.md) had just moved the scale bar, the other light piece of map chrome, onto the theme's ground.

## Decision

- **Every colour a card wears is a `--popup-*` value, declared once per theme in `map.css`.** `popupChrome.ts` names them in its markup (`var(--popup-label)`), which resolves where the markup lands; `map.css` names them for the parts MapLibre draws, the card's surface, its tip, the close button and the scroll bar. They sit in `map.css` rather than `index.css`, which every page loads, because only the map draws a popup.
- **The light card keeps its colours.** Its values are the hexes it always painted. Its links are the one change, in both themes (below).
- **The dark card is the panel's own.** Its surface is `panel`, the surface every popover stands on; its header band and grid columns are halfway between `panel` and `raised` in oklab; its ranked cell is `raised`; its ink, label and fine print are the panel's `ink`, `ink-soft` and `ink-faint`; its link-out glyph is `accent-ink`; its lines are `rule` and `frame`; its primary button is the accent fill. Each is a `--ui-*` token, so the card cannot drift from the panel beside it.
- **A link in a card is underlined in the colour of the text around it, in both themes** (the maintainer, 2026-10-16, on this PR): a grid number in the card's ink, the coordinates in the facts line's grey. The results table marks a linked number that way, and sky at rest is the accent that says a thing acts; on every number of a grid it was the card's loudest colour, and in the dark card the inconsistency with the table beside it showed. The coordinates follow for the same reason: they are a fact about the place like the elevation beside them, and the maintainer saw no case for setting them apart. The underline still says link. `LINK_COLOR` and its `--popup-link` are gone; sky stays on the title's link-out glyph alone, and a warning keeps its amber.
- **The ranked family wears the table's colours** (the maintainer, 2026-10-16, on this PR). Every number in the family the report ranks by takes the results table's tint and ink for it, from the same `cellColor`, each on its own column's scale, so the card, the table and the marker under the card colour one number alike. The fill is the band at 20% in both themes and the ink is each theme's, so a cell carries both inks and `map.css` picks one, which keeps an open card right across a theme switch. The ranked number stays bold, which is how the card says which number ranks: the table says it with the arrow on its column's head. The slate ranked cell of option H (TJ, 2026-10-08) is kept only for a ranked number its scale cannot colour. Option H chose no hue partly so the card's only colour would be its links, which no longer wear one.
- **The warning amber stays amber-500 in both themes.** It is the maintainer's choice on white (2026-10-08), and on the dark card it clears AA.
- **The ring's remove-point popup follows too.** It is the one popup that is not a card, a bare button, and it stands on the same surface.

## Evidence

Measured 2026-10-16 in `styles.test.ts`, from `map.css`, `index.css` and Tailwind's palette.

| Pair, dark card | Ratio | Light card |
|---|---|---|
| Ink, and every grid number, on surface, band, ranked cell | 11.86, 10.05, 8.40 | 21.00, 19.17, 17.03 |
| Label, and the coordinates, on surface, band | 5.56, 4.71 | 7.58, 6.92 |
| Link-out glyph on band | 5.69 | 3.74 |
| Warning on surface | 6.81 | 2.15 |
| Fine print on surface, band | 3.07, 2.60 | 2.98, 2.34 |
| Band on surface, ranked cell on band | 1.18, 1.20 | 1.10, 1.13 |
| Primary, secondary, danger label on fill | 4.56, 6.15, 3.76 | 4.10, 8.40, 3.76 |
| Scroll thumb on band | 4.71 | 4.34 |
| A ranked family's ink on its tint, lowest over every band | the table's own (same surface) | 6.00 |

Every dark text clears 4.5:1 and every icon 3:1, except the fine print, which steps back as far as the light card's does, and the danger button, which is unchanged in both. The band and the ranked cell part from the dark surface about as far as the light ones do from white. The browser suite's axe run now opens a result card in each theme and finds nothing serious. Screenshots of all five cards in both themes, at a desk and on a phone, are on the PR.

## Alternatives rejected

- **A, white cards in both themes:** the flash on every click in the dark theme, which is the issue.
- **C, dark cards in both themes:** in the light theme a dark card over a light map is the same flash inverted.
- **A darker card, `recessed` under a `panel` band:** every pair passes with more room, but the card was the darkest surface in the app, a step under every popover beside it.
- **The `raised` step for the band:** the panel's soft ink falls to 4.04:1 on it.

## Consequences

A new colour in a card is a `--popup-*` pair in `map.css` and a measured pair in `styles.test.ts`, not a hex in `popupChrome.ts`. The tip of a card anchored below its point stands against the band rather than the surface, a 1.18:1 seam in the dark theme where the light one has the same seam at 1.10:1.
