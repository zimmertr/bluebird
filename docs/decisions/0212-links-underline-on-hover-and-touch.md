# 0212. A link in the table or a popup reads in its text's colour, underlined on hover and faintly on touch

- Status: Accepted. Amends 0163 (a link in a card was underlined at rest, and the link-out glyph was the accent).
- Date: 2026-10-21
- Decider: the maintainer (TJ), on the review of PR #789: asked why the destination names were blue when nothing else in the table or the popup was, chose names in the text's colour underlined on hover, and asked that every link in the table and the popup follow suit. Claude flagged that a touch screen never hovers; the maintainer chose a faint underline at rest on touch, and the popup's glyph in a grey like the table's.
- Issues and PRs: #786, #789, #740, #696
- Cited in code as: #786, record 0212
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Style through the design system, never ad hoc"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTableRow.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `popupChrome.ts`; [`docs/STYLES.md`](../STYLES.md), Roles, The popups, The results table; [`docs/USAGE.md`](../USAGE.md), the results table

## Context

The results table said "link" two ways. A destination's name was the accent blue (`LINK_ACTION`), which dates from when the name was the one thing in a row a press did anything with. A number linked to Windy, a fire or a closure order was underlined at rest in its own colour (`TABLE.valueLink`, the maintainer, 2026-10-14), because it had been underlined on hover alone and a phone showed no cue. Record [0163](0163-popups-follow-the-theme.md) took the popup's links to the table's numbers' look, underlined in the text's colour, and kept the accent on the title's link-out glyph. Since #696 a press anywhere on a row opens its popup, so the blue name no longer marked the row's one action. It was the one blue thing in the table, beside a popup with no blue link in it.

The maintainer chose the quieter of the two: no underline until a hover. On a touch screen nothing hovers, so that alone would leave a phone with no sign of any link.

## Decision

- **One link look across the table and the popup**, in the colour of the text it stands in: the table's names, its linked values and its footnote marks (`LINK_QUIET` in `styles.ts`), and a card's grid numbers, coordinates and warning lines (`data-popup-link`, ruled in `map.css`).
- **At a desk, no underline at rest.** A hover underlines a link, and so does keyboard focus. WCAG's technique G183 asks that much of a link that colour cannot tell apart.
- **On a touch screen, a thin underline at rest** in the secondary ink (`ink-soft` in the table, the card's label grey in a popup). It is the one cue there, so it owes 3:1 wherever a link stands. The faint ink the maintainer was first offered measured 2.6:1 on the dark card's grid band, so it is the next ink up.
- **The popup's link-out glyph rests in the label grey and takes the accent on hover and focus**, as the table's glyph rests in a grey and takes the accent. The table's wears the faint ink, which reads 2.6:1 on the dark band, so the card's is the label grey.
- **The accent at rest is kept for commands**: a menu's Reset all, Restore all and Remove all, and a sheet's Done (`LINK_ACTION`).

## Evidence

Measured 2026-10-21 in `styles.test.ts`, against the values `map.css` and `index.css` declare. The touch underline in a popup, the label grey: 5.56, 4.71 and 3.94:1 on the dark card, its grid band and its ranked cell, and 7.58, 6.92 and 6.15:1 on the light. The faint ink on the dark band: 2.6:1. The glyph on the header band: 4.71:1 dark and 6.92:1 light at rest, 5.69 and 3.74:1 on hover, the accent the glyph wore before. The table's touch underline, `ink-soft`: 5.5:1 on the dark panel and 7.47:1 at the least on a light surface.

## Alternatives rejected

- **Hover alone, nothing on touch**: a phone reader would see no link anywhere, which is what the maintainer's 2026-10-14 call on `TABLE.valueLink` had fixed.
- **A faint underline at rest on both**: one look at both widths, but a desk keeps a line under every name and number, which the maintainer asked to drop.
- **The names kept blue**: the one accent in a table whose other links read in their text's colour.
- **The faint ink for the touch underline and the glyph**: 2.6:1 on the dark card's grid band.

## Consequences

`TABLE.valueLink` is gone; every table link wears `LINK_QUIET`. `popupLink` writes `color:inherit` and the `data-popup-link` attribute, and leaves the underline to `map.css`, since an inline style cannot answer a hover. The glyph keeps its inline `var(--popup-glyph)`, and `map.css` sets that value on the hovered or focused anchor. `styles.test.ts` pins the role, the rules and every ratio above; `popupChrome.test.tsx` the attribute.
