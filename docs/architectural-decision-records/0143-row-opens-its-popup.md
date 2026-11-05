# 0143. A press on a results row opens its marker's popup, and a phone's sheet drops to its bar first

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14; the popup's remove the same evening, and its rule that night
- Issues and PRs: #696, #708, #336, #536
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTableRow.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useRowFocus.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `rowTap.ts`, `resultPopup.ts`, `popupChrome.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `resultsLayer.ts`

## Context

The name's button flew the map to a destination and opened its popup. The rest of the row did nothing, and on a phone a finger aimed at a 13px name in a scrolling table often missed it.

## Decision

- **A press anywhere on a ranked row's ground opens the popup a click on its marker gives**, through the same `focusResult` the name's button takes, at both widths. The pointer says so over the whole row (`TABLE.rowOpens`).
- **A press on a control in the row is that control's alone** (`rowTapOpens`): the chart box, the remove, the name's button and its external map link, a Windy link, a footnote mark. Read off the element the press landed on, so a control added later is excluded without anyone remembering to. A press that ends a text selection opens nothing.
- **On a phone the sheet drops to its bar first**, and the camera moves in the commit after, once the camera's bottom pad is the bar's (`useRowFocus`). The name's button does the same.
- **The row takes no role or focus**: the name's button stays its way in for a keyboard and a screen reader.

## The remove control on touch: the popup carries it

- **A ranked marker's popup ends in `Remove from analysis`**, the words and the `popupButton` look the clicked basemap feature's popup uses (record [0139](0139-clicked-feature-popup-wears-the-result-card.md)), centred in the card's foot the way that popup places its action (`popupAction` in `popupChrome.ts`, which both popups now share). On the ranked card the foot is a section of its own, ruled off from the grid by the edge and padding the warnings section above the grid wears (`SECTION_EDGE`, `SECTION_PAD_Y`; the maintainer, later the same night), because without the rule the button read as one more row of numbers. The clicked feature's card needs none: its button is the whole body, already under the header's edge. Pressing it does what the row's × does, the removal in `useRemovals` through `onRemoveResult`, and closes the popup; the removed row shows the way a removed row always has.
- **On a coarse pointer the row's remove is this action**, reached by the row tap above, so the × beside the rank is no longer forced visible on touch: `index.css`'s `row-remove` rule is gone and `TABLE.removeFace` hides the × on a coarse pointer. A fine pointer keeps the hover ×.

The first cut of this record left the touch remove unchanged, because the marker popup had no remove action to reach; the maintainer added one on 2026-10-14.

## Evidence

Shot 2026-10-14 at 360, 390 and 430 wide: a tap on a row's Type cell opened one popup and left the sheet at its bar, and the popup's `Remove from analysis` took the row out of the ranking. The browser suite's `rowTap.spec.ts` holds both widths and one removal through the popup.

## Consequences

A pending row has no forecast card and opens nothing from its ground; its name still flies the map to it.
