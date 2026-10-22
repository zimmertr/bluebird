# 0213. A popup's buttons answer a hover and a press as the app's do

- Status: Superseded by [0215](0215-popup-is-the-panel.md): the buttons wear the app's own `BUTTON_ACCENT`, whose hover is the app's.
- Date: 2026-10-21
- Decider: the maintainer (TJ), on the review of PR #789: "Add to analysis and Remove from analysis buttons also don't have any hover effect to indicate they are buttons when a cursor or touch is over them like the other buttons like Analyze." The hover shades are Claude's, measured below.
- Issues and PRs: #786, #789, #365, #740
- Cited in code as: #786
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `popupChrome.ts`; [`docs/STYLES.md`](../STYLES.md), The popups

## Context

A popup's buttons are markup MapLibre sets as HTML, so `BUTTON_PRIMARY` and its siblings in `styles.ts` cannot dress them, and `popupButton` wrote their fill inline (#365). An inline style cannot answer a hover, so the three buttons a popup draws (Add to analysis, Remove from analysis and a ring's ✕ Remove point) stood still under the pointer while every button in the panel and on the map changed.

## Decision

- **Each fill is a `--popup-*` value the button reads inline**, the danger red included, which was a bare hex.
- **`map.css` steps the value to its `-hover` twin on the hovered button** (`data-popup-button` names the variant), under `(hover: hover)` as Tailwind's `hover:` is, **and on the pressed one** (`:active`), so a finger sees its press land.
- **A white label's fill darkens**, which gains contrast: the light card's accent to sky-700, the red to red-600. The dark card's accent lightens to the panel's own Analyze hover, so the two buttons answer alike. The dark card's grey lightens halfway in oklab to the edge step (slate-500), as far as its label keeps AA. The light card's grey lightens to slate-600.
- **A 150ms colour transition**, the app's `transition-colors`.

## Evidence

Measured 2026-10-21 in `styles.test.ts`, each label on its hover fill, dark then light: the accent 4.02 and 5.93:1 (the dark one the panel's Analyze hover, under AA by design, record 0008), the grey 4.89 and 6.15:1, the red 4.83:1 in both. The full slate-500 step under the dark grey's label measured 3.86:1, which is why the hover stops halfway. `linkLook.spec.ts` reads the grey's fill change under a hovering pointer in a browser.

## Alternatives rejected

- **A `filter: brightness()` on hover**: one rule for all three, but it dims the label with the fill and is measured nowhere.
- **The dark grey to slate-500**: 3.86:1 under its label.
- **Hover alone**: the app's own buttons do nothing under a finger either, but the maintainer asked for a cue "when a cursor or touch is over them", and a press is the one thing a finger does.

## Consequences

`POPUP_BUTTON_LOOK` names a value for every variant, and `map.css` declares six more per theme, which `styles.test.ts` holds to both blocks. A new popup button variant needs a fill, a hover value and the two rules.
