# 0215. A popup is the panel's own surface, and its button the panel's own button

- Status: Accepted. Supersedes [0213](0213-popup-buttons-answer-the-pointer.md). Amends [0163](0163-popups-follow-the-theme.md) (the light card is no longer the white it always was) and [0112](0112-colour-values-have-owners.md) (`popupChrome.ts` no longer owns a colour). Amended by [0217](0217-popup-in-the-app-face.md).
- Date: 2026-10-22
- Decider: the maintainer (TJ), on the review of PR #789: "Why is Add to analysis a blue button and remove from analysis a grey button? (Or black in light mode)? This is the top of UI discrepancies that make a product like bluebird look really poor and vibe coded." TJ picked all three popup buttons blue, and the whole popup on the app's tokens, and on the approach: "i've been advocating for that for the start with the use of styles".
- Issues and PRs: #786, #789, #740, #365, #706
- Cited in code as: #786
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `popupChrome.ts`; [`CLAUDE.md`](../../CLAUDE.md), the both-themes rule; [`docs/STYLES.md`](../STYLES.md), The popups

## Context

A popup's markup is a string handed to MapLibre's `setHTML`. Record 0112 treated that as a channel the stylesheet never reaches, gave `popupChrome.ts` colours of its own, and record 0163 kept the light card's values the hexes the white card had always painted. So the popup had a second palette that copied the app's and passed every check, because the checks asked where a colour was written and how it contrasted, never whether it was the app's.

The copy drifted. On the light card Remove from analysis was slate-700 under slate-200, a dark-theme button that read near-black on white, where the app's grey button in light is pale. Its blue was #0284c7, where the app's accent is sky-650, and white on it measured 4.1:1, under AA. The card was white where the panel is #eef2f9, its links #0284c7 where the app's are #00639b, and its warning amber-500, a copy of the table's amber that read 2.15:1 on white. In both themes Add to analysis was blue and Remove from analysis grey, two looks for the one action a card carries.

The premise was wrong. Tailwind emits a class for any name it finds in the source, wherever the string goes, and a popup sits in the same document as the panel, so the app's classes dress it.

## Decision

- **The popup's button is `BUTTON_ACCENT`, as its class list.** `popupButton` writes the class and nothing else, so its fill, label, corners, size and hover are the panel's button's in both themes. Add to analysis, Remove from analysis and ✕ Remove point all wear it: a card has one action, and the app marks every command in the accent. Red stays for errors.
- **Every `--popup-*` value is an app token**, declared once on the root, where the light theme redefines the tokens. The card is the panel's surface, its band and ranked cell the raised steps, its inks, rules, glyph, scroll thumb and close button the panel's, its header shade `--scroll-shade` and its warning the table's `--ui-warn`. The light block says the colour scheme and nothing else.
- **`popupChrome.ts` leaves the linter's colour owners**, so a literal colour there fails `value-hex`.
- **The press shade record 0213 gave the popup's buttons alone is gone.** The app's buttons answer a hover and not a press; a press shade, if wanted, belongs on every button role.

## Evidence

Measured 2026-10-22 in `styles.test.ts`, dark then light, each on the surface it lands on:

| Pair | Dark | Light, before | Light, after |
|---|---|---|---|
| Card ink on the card, band, ranked cell | 11.86, 10.05, 8.4 | 21 on white, 19.17, 17.03 | 15.25, 14.42, 13.66 |
| Label on the card, band | 5.56, 4.71 | 7.58, 6.92 | 8.34, 7.89 |
| Warning on the card | 10.1 (was 6.81) | 2.15 | 6.31 |
| Fine print on the card, band | 3.07, 2.6 | 2.98, 2.34 | 4.32, 4.09 |
| Glyph at rest, on hover | 4.71, 5.69 | 6.92, 3.74 | 7.89, 5.43 |
| Scroll thumb on the band | 4.71 | 4.34 | 3.76 |
| Button label on its fill | 4.56 (the accent) | 4.1 (sky-600) | 4.56 (the accent) |

`popupParity.spec.ts` reads the rendered popup in a browser in both themes: the card's background is the panel's, its ink the app's, and its button's fill, label colour, size, weight, line height, padding and corners equal a button with the same class list standing in the panel, at rest and under the pointer.

## Alternatives rejected

- **Add blue, the removes in the app's grey button**: the follow/unfollow pattern, but two looks for a card's one action.
- **Buttons alone on the app's classes**: leaves the light card's surface, links and amber a second palette.
- **A browser comparison without the source rule**: catches drift after it ships. The token rule fails it in the editor.

## Consequences

A new popup colour is an app token named in `map.css`, or a new token in `index.css` with a value in each theme. A change to the panel's surface, inks or accent reaches the popup with no edit there. The card's face is still its own (`POPUP_FACE`, `font-family:sans-serif`), where the panel wears the system face; that is the next drift of this kind, and moving it changes the card's measured widths.
