# 0270. A card's body stands between a quarter and three quarters of the visible map, and a handle in its corner sizes it

- Status: Accepted; supersedes [0123](0123-popup-grid-and-scroll-cap.md) in part (the 200px card floor) and [0266](0266-every-card-is-a-stack-of-foldable-layer-sections.md) in part (the 48px body floor)
- Date: 2026-11-03
- Decider: the maintainer (TJ), 2026-11-03, on PR #845 (items 7 and 9 of the review)
- Issues and PRs: #832, PR #845
- Browser test: `frontend/e2e/cardResize.spec.ts`
- Cited in code as: TJ, 2026-11-03
- Guide: `utils/popup/` guide: `popupFit.ts`, `popupChrome.ts`; `map/` guide: `mapPopups.ts`, `destinationCards.ts`; `src/` guide: `iconPaths.ts`; `STYLES.md`, `CARD_RESIZE`; `USAGE.md`, the card paragraphs

## Context

A card's body was capped only where the free map could not hold it, so on a tall desk nothing kept a card with every layer on from running most of the map's height. Two floors guarded the cap, each its own number: `MIN_CAPPED_PX` (200px of card) at open, below which the card was left whole and panned, and `LEAST_BODY_PX` (48px of body) for a card that grew after it opened. Neither followed the map's height. A card's size was the app's alone: a reader who wanted a wider grid or a shorter card had no way to ask for one.

## Decision

- **A ceiling.** A card's body is never taller than three quarters of the visible map's height (`BODY_CEILING_SHARE` in `utils/popup/popupFit.ts`), even where the map has room for all of it. Past that the body scrolls under its header. The visible map is `regionNow` in `map/mapPopups.ts`: the canvas less the results sheet.
- **A floor.** A capped body keeps at least a quarter of the visible map's height (`BODY_FLOOR_SHARE`). Where the fit cannot give a body that much where its card stands, the body keeps it and the map pans, title first, as it already did for a card that does not fit. A body shorter than the floor is never capped.
- **Both bounds hold at open and on a later cap.** `openingBodyCap` caps a card as it opens: the fit's cap (`capHeight`) under the ceiling, never under the floor. `grownBodyCap` caps a card that grew where it stands, and says how far the floor runs past the map's edge, which `bodyCap` pans in. A map with no visible height caps nothing, since there is nothing to fit a card to.
- **A handle in the corner.** Every card ends on a handle in its bottom-right corner, over the action's foot: a diagonal grip (`GRIP` in `iconPaths.ts`, at the `chip` step) in the popup's glyph grey, taking the accent under a pointer as the fold's chevron does. Its box is `CARD_RESIZE` in `styles.ts`: 16px at a desk and 32px under a finger, a phone control's size (record [0223](0223-finger-controls-draw-32.md)).
- **The drag.** A pointer or a finger on the handle (`setPointerCapture`) sizes the card's width from 180px to the map less 20px (`cardWidthRange` in `popupChrome.ts`), and its body's height between the floor and the ceiling, re-capping the body as it goes. MapLibre stands a card centred on its point, so the width takes twice the pointer's travel and the handle stays under the pointer; the tip stays on the point because the library places a card by a share of its own width.
- **The size follows the reader.** The size a drag leaves holds for every card opened after it until the page is reloaded (`chosen` in `map/destinationCards.ts`, beside the folds), the maintainer's one rule for folds. A card opened at that size is still fitted, capped and panned as any card is, and the floor and the ceiling of the map it opens on still bound it. A drag on a card with no body, a spot with no layer on, sizes its width alone.
- **Pointer-only.** The handle is `aria-hidden`, has no name and is never focused. A name would be a new string for a control the keyboard cannot work, and a keyboard reader has the body's scroll for what a short card hides. Flagged to the maintainer, 2026-11-04.

## Evidence

On the branch before this change (`ec48fd6b`), `openCard` capped a body only when `capHeight` found the card too tall for the free map, and `capHeight` gave up under a 200px card. `bodyCap` kept a grown body at 48px or more. On a 1000px map a card of 800px with a 760px body stood whole and uncapped; it now caps at 750. On a 300px map a card with 200px of header and foot used to be left whole and panned; its body now keeps 75px and the card pans title first (`popupFit.test.ts`, `mapPopups.test.ts`).

The grip on the card's surface, measured 2026-11-04 in `styles.test.ts`: the glyph grey reads 5.56:1 in dark and 8.34:1 in light, and the accent under a pointer 6.71:1 and 5.74:1, each over the 3:1 a graphic owes.

## Alternatives rejected

- A handle that names itself, or a keyboard path to the size: both need a new string, and a size is a convenience the body's scroll already covers for a keyboard.
- A drag held to where its card stands, as the fit is: the maintainer set the floor and the ceiling as the drag's bounds, and the size a reader chose is theirs to keep.
- A size kept for the card it was dragged on only: a second rule beside the folds', which follow the reader to every card.

## Consequences

`capHeight` takes its `min` from its caller and `MIN_CAPPED_PX` is gone, as is `LEAST_BODY_PX`. `MapPopups` gains `cardBounds` and `sizeCard`, `openCard` a `size`, and `bodyCap` a `roof`, the reader's height, so a card that grows after it opens at a chosen size keeps under it. `popupCard` gains `position:relative` on its root for the handle, and every card's markup ends on it.
