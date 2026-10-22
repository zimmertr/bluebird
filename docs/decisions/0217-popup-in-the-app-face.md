# 0217. A popup is set in the app's face

- Status: Accepted. Amends [0123](0123-popup-grid-and-scroll-cap.md) (the marker card's cap is 374px and a compact band's inset 2px) and [0215](0215-popup-is-the-panel.md) (the face was the one part of the card still its own).
- Date: 2026-10-22
- Decider: the maintainer (TJ), on the review of PR #789: of the options put to him, "Use the app's face", and for the width it costs, "Cap 374, phone bands 2px".
- Issues and PRs: #786, #789
- Cited in code as: #786
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `popupChrome.ts`

## Context

The card declared `font-family:sans-serif`, which Chrome on macOS resolves to Helvetica, while the panel beside it reads in the system face, SF Pro. It was the last part of the card with a value of its own after 0215 put its colours and its button on the app's. The map already inherits the app's face (`.maplibregl-map` in `map.css`), so the card's declaration was the only thing standing between them.

The app's face is wider. `Precipitation (in/hr)`, the widest row label, measures 109.03px at 12px in it against 100.71px in Helvetica (Chrome on macOS, 2026-10-22), so every grid width 0123 measured grows by 8.32px.

## Decision

- **The card sets no face.** `popupCard` keeps its leading (`POPUP_LEADING`) and inherits the font, so a popup and the panel are one face on every system.
- **The marker card's cap is 374px**, from 366px: the widest grid at full inset is now 352.9px (`WIDEST_GRID_PX` 353), and the body is the card less 10px a side.
- **A compact grid's band inset is 2px a side**, from 3px. Four bands' insets give back the 8px, so a grid with a two-digit window total is 319.7px and a 360px phone's 320px of body still holds it. A map takes the compact grid under 393px, where it did under 385px.

## Alternatives rejected

- **Keep Helvetica in popups**: the one drift 0215 left, and the kind the maintainer has spent weeks removing.
- **A 374px cap and 3px compact insets**: a two-digit total would scroll about 8px sideways on a 360px phone, which 0123 had made fit.

## Consequences

A popup's text is a little wider on a Mac, and its bold is the system face's. `popupFit.spec.ts` emulates the label at 109.03px, and `popupParity.spec.ts` checks the card's button against the panel's with the face included.
