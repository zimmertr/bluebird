# 0147. The map's buttons and its credit line wear the app's chrome; the scale stays the library's

- Status: Accepted. Reverses the 2026-10-13 audit's M01 decision ("MapLibre's white controls stay") for the buttons and the credit line. Amends 0135 (the compass stands under the locate button). Amended by 0162 (the scale bar stands on the theme's ground, still with no chrome).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14: the compass first, then the zoom pair and the locate button on a desk, then the (i) and its credit line, in three messages the same evening; the scale bar kept native in the last of them; the compass needle redrawn and the (i)'s glyph centred on a Pixel after that
- Issues and PRs: #696, #708, #687, #709, #336
- Cited in code as: #696
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `PhoneMapRows.tsx`, `MapStage.tsx`, `MapView.tsx`; [`docs/STYLES.md`](../STYLES.md), Phone chrome

## Context

The audit on #687 kept MapLibre's white controls (its M01) because they were the library's and read as the map's own. Once a phone's locate button stood in the app's dark round slot beside the search pill (record [0135](0135-phone-opens-on-the-map.md)), the compass that #709 shows only off north came up as a white box in a third row of its own at the top right, and a desk's zoom pair, compass and locate button were a white stack beside the dark column.

## Decision

- **One role for every button the library draws on the map** (`MAP_ROUND_BUTTON`): a 40px dark round button on the app's floating slate with its edge, the accent's edge under a pointer and the app's focus ring, handed to each button by `map/controls.ts` (`dress`). On a touch screen each takes a 44px target by a rim `map.css` draws, never a `touch:` utility.
- **A phone's compass stands at the chip row's right end, directly under the locate button** (`MAP_SLOT.compass`, `placeControl`, a slot `PhoneMapRows` hands up), and keeps the library's behaviour: a press turns the map to north, and it hides while north is up (`hideCompassWhileNorthUp` now toggles the button itself). The navigation control's zoom pair is hidden in that slot, since a pinch zooms.
- **The compass needle is redrawn for the dark button**, not inverted with the other glyphs: the library draws its south half dark grey, which inverted vanished on the dark chrome. North is red-500 and south slate-50, at the library's size and paths, each edged in slate-600 so the light half keeps an outline on a light button too (`map.css`). Measured: red-500 3.89:1 on the button's slate-800 and 3.76:1 on white, slate-50 13.98:1 on slate-800, the edge 7.58:1 on white.
- **A desk's zoom pair is two round buttons 4px apart**, then the compass while the map is turned, then the locate button, one column at the map's top right.
- **The (i) is a round dark button too** (`MAP_CREDIT.button`), drawn at the library's 24px because it stands in the corner band beside the scale, with a 44px target on touch; its bottom stays on the Analyze button's bottom edge on a phone (record [0140](0140-phone-notices-on-the-map.md)). **The opened credit line is the app's floating card** (`MAP_CREDIT.card`: the surface, edge and radius the popups and the band wear), its links dressed in `map.css` the way `LINK` dresses the app's, slate-300, underlined, sky-400 under a pointer, because the library writes the anchors. Its width cap and its upward wrap are unchanged. The (i)'s glyph is centred on the button's whole box (`background-origin: border-box`): the library places its 24px drawing at the top left of the padding box, which the role's 1px border shrinks to 22px, so the glyph stood off centre and clipped; centred, its middle is the button's at 360 and 390 (`phoneCorner.spec.ts`).
- **The scale bar stays the library's**, on both widths: it is a measurement drawn on the map, like the labels, not a control.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium. A phone with the map turned: the compass 40px wide at x 308, 338 and 378 at 360, 390 and 430 wide, its top 4px under the locate button's bottom and its right edge on the locate button's. At 360 the summary chip gives up its last word to the compass (the Legend chip's right edge at 302). A desk at 1440x900 with the map turned: zoom in 12 to 52, zoom out 56 to 96, the compass 100 to 140, the locate button 144 to 184, all 40px square at x 1388. The credit line at a desk is one row, 449 by 22, at the map's bottom right.

## Alternatives rejected

- **MapLibre's white controls** (the audit's M01): kept until the maintainer read the compass in its own white row on a Pixel.
- **The scale bar in the app's chrome:** it is a ruler over the map, not a button.

## Consequences

`addControls` returns the navigation control beside the locate control, and `placeControl` replaces `placeLocate` for either. `MapView` and `MapStage` carry `compassSlot`. Every library button the map shows wears the role, so a control added later through `addControls` is dressed by the same call.
