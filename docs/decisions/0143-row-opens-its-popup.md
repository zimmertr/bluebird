# 0143. A press on a results row opens its marker's popup, and a phone's sheet drops to its bar first

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14
- Issues and PRs: #696, #708, #336, #536
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsTableRow.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useRowFocus.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `rowTap.ts`

## Context

The name's button flew the map to a destination and opened its popup. The rest of the row did nothing, and on a phone a finger aimed at a 13px name in a scrolling table often missed it.

## Decision

- **A press anywhere on a ranked row's ground opens the popup a click on its marker gives**, through the same `focusResult` the name's button takes, at both widths. The pointer says so over the whole row (`TABLE.rowOpens`).
- **A press on a control in the row is that control's alone** (`rowTapOpens`): the chart box, the remove, the name's button and its external map link, a Windy link, a footnote mark. Read off the element the press landed on, so a control added later is excluded without anyone remembering to. A press that ends a text selection opens nothing.
- **On a phone the sheet drops to its bar first**, and the camera moves in the commit after, once the camera's bottom pad is the bar's (`useRowFocus`). The name's button does the same.
- **The row takes no role or focus**: the name's button stays its way in for a keyboard and a screen reader.

## The remove control on touch: not changed

The maintainer asked for the row's remove on a coarse pointer to be the marker popup's remove, reached by this tap. The popup a ranked marker opens (`resultPopupHtml`) carries no remove action today; only a clicked basemap feature's popup (`poiPopupHtml`) does. So that part stopped, as the brief said, and `index.css`'s `row-remove` rule still shows the number and the × side by side on touch.

## Evidence

Shot 2026-10-14 at 360, 390 and 430 wide: a tap on a row's Type cell opened one popup and left the sheet at its bar. The browser suite's `rowTap.spec.ts` holds both widths.

## Consequences

A pending row has no forecast card and opens nothing from its ground; its name still flies the map to it.
