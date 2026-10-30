# 0254. The map's buttons and its search pill are 32px, the chips' height

- Status: Accepted. Amends 0135 (the first row is 32px, so the rows end 84px down), 0147 (the map buttons are 32px round, their glyphs 23px) and 0174 (a desk's corner column and zoom pair are 32px).
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #799: "Are the map buttons too big? They look bigger than the rest of the UI. They should probably be the same size, right?", then "32px, pill too" from a mock of both sizes at a desk and on a phone, folded into #823
- Issues and PRs: #799, #823
- Cited in code as: record 0254
- Guide: [`docs/STYLES.md`](../STYLES.md), `MAP_ROWS`, `MAP_PILL`, `MAP_ROUND_BUTTON`, `MAP_SLOT`, `MAP_ZOOM_PAIR`; `frontend/src/map.css`; `frontend/src/utils/results/resultsSheet.ts`, `MAP_ROWS_PX`
- Related: 0135 (the map's two rows), 0147 (the map buttons wear the app's chrome), 0174 (a desk's corner), 0223 (a finger's controls draw 32)

## Context

The compass, the 3D button, the locate button, the zoom pair and the search pill were 40px, from #696 and records 0147 and 0174. The chips under the pill, the panel header's round buttons and, since record 0223, every control a finger presses are 32px. At a desk the corner column stood 40px beside 32px chips, and the header's two round buttons were 32 where the map's were 40: one shape at two sizes. On a phone the 3D and locate buttons share the pill's row, so they could only shrink with the pill. The maintainer compared the two sizes on the preview with CSS injected for the smaller one.

## Decision

- **The map's buttons and the search pill are 32px at both widths**: the compass, 3D, locate, a desk's zoom halves, and the pill. The first row is 32px, so the rows end 84px down (12 + 32 + 8 + 32), and every anchor built from that sum moves with it: the draw bar, the compass's place under the rows, the bottom sheet's cap and the results sheet's highest stop (`MAP_ROWS_PX`).
- **The library's glyphs scale to 23px**, the share of the button they held at 40px (29/40 of 32), at rest and in the hover fade.
- **Every press stays 44px on a coarse pointer**: the buttons' rim is 7px inside their border (30 + 14) and the pill's field reaches 7px past its border.
- The Analyze button stays 40px, the one primary button.
- The (i) keeps its 24px in the corner band.

## Enforcement

- `styles.test.ts` holds the rows to 32, 8 and 32, every anchor to their sum, the map buttons and the pill to the row, each press to 44, and the glyph to 29/40 of the button.
- `resultsSheet.test.ts` holds `MAP_ROWS_PX` to the same sum.
- `e2e/deskCorner.spec.ts` and `e2e/terrain.spec.ts` measure the buttons at 32.

## Alternatives rejected

- Keeping 40px, as Google Maps sizes its map buttons: in this app 32 is every other round or pill control's size.
- 32px at a desk only, with a phone's row kept at 40: two sizes for the same buttons.
