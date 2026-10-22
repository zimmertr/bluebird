# 0208. The Analyze button counts the messages and opens the one list; a blocker stands under its field

- Status: Accepted. Supersedes 0140 (no notice band on a phone's map). Amends 0028 (every message is in one list, the list the Analyze button's badge opens, rather than one block under the button; a blocker stands under its field as well) and 0207 (the Analyze button is the one thing on the foot of a phone's map, and no band rides the Controls sheet's edge).
- Date: 2026-10-21
- Decider: the maintainer (TJ), on issue #786, from the combined mockup (section 11 of the ideas artifact, 2026-10-21): the blockers inline under their fields and a count badge on the Analyze button opening one list, with four calls the same day: the badge on the Analyze button alone, not beside a phone's theme switch; a greyed button opens the list from a press anywhere on it; the badge wears the worst severity's colour; the phone's sheet is headed Messages. The blocker's lack of a × is Claude's call, flagged on the PR.
- Issues and PRs: #786, #253, #696, #123
- Cited in code as: #786
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every message is in the one list the Analyze button opens"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx`, `PhoneFoot.tsx`, `MessageBadge.tsx`, `MessageList.tsx` and `BlockerLine.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `usePanelMessages.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `panelMessages.ts`, `notices.ts` and `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Every message is a box, Phone chrome; [`docs/USAGE.md`](../USAGE.md), On a phone, Analyze

## Context

Record [0028](0028-notices-below-analyze.md) put every message in one block under the panel's Analyze button, and record [0140](0140-phone-notices-on-the-map.md) moved that block onto a phone's map, in a band on the results sheet's edge under the button, three lines tall and scrolling past them. The maintainer's review of the desk design (#714) found the result wanting on both widths (#786): at a desk the block pushed the panel's footer about with every line that came and went, and on a phone the band showed one message and no sign of the rest, so a reader with four of them read the first and scrolled a 66px strip for the others. A blocker, the one kind of message the reader can act on at a field, stood a screen away from the field it was about, which is the complaint #123 fixed the first time by gathering everything in one place.

Ten mockups were drawn and one combined design chosen, 2026-10-21.

## Decision

- **A blocker stands under the field it validates**, as the field's own readout the way the draw counter is (`BlockerLine`): a dot in its severity's colour and the sentence, no box, no ×. Which field is `BLOCKER_HOME` in `panelMessages.ts`: the area and the point count under the polygon's counter, the types under the type boxes, no destination under the Destinations heading, the window and the dates under the When field, the two comparison blockers under the Model row. Each section renders its own homes' lines and the linter holds the lines to the two sections (`style-blocker-home`, `style-draw-counter`, `style-forecast-blockers`).
- **The Analyze button counts every message** in a badge at its corner (`MessageBadge`): the count, in the worst severity's colour, error over warn over info (`worstSeverity`), the digit in the panel's colour so it clears AA on the fill in both themes (`styles.test.ts`). A badge is the one summary a reader gets without a press, so it says how many and how bad, and nothing else. The same badge on the panel's button at a desk and on the map's button on a phone; nowhere else, and not beside a phone's theme switch.
- **A press on the badge opens the one list** (`MessageList`): the severity boxes of record 0028, in error, warn, info order, every message whole with its × unless it is a blocker, on the one menu (record [0201](0201-one-menu-for-every-trigger.md)): a card over the button at a desk, at least the button's width, and a bottom sheet headed Messages on a phone. The list goes with the last message.
- **A greyed button is live.** A blocker greys the button with `aria-disabled` rather than `disabled` (`BLOCKED`), and a press anywhere on it opens the list, since the list is where every reason is. Busy stays `disabled`: a run is the button's own news, with nothing to act on. The gate itself does not change: `analyzeEnabled` is what it was.
- **A blocker is never dismissed.** It is the field's state until the reader supplies what it asks, and a dismissed one would leave a greyed button with nothing to say for itself. The × stays on every other message, and the ledger of record [0028](0028-notices-below-analyze.md) is unchanged for them.
- **One live region**, `MessageRegion`, mounted for good beside the badge and holding every current message out of sight, so a screen reader hears a message as it arrives whether or not the list is open. The list announces nothing itself (`style-message-list`, `style-live-region`).
- **The block and the band are gone.** `PanelFooter` draws the button, the badge and the links; `PhoneFoot` the button and the badge; `App.tsx` derives the messages once (`usePanelMessages`) for both widths. `CONTROLS_MAP_PX` keeps its 256, so the Controls sheet opens where it did; the 76px the band had above it is the maintainer's to take back.

## Evidence

The four calls, issue #786, 2026-10-21. The mockups, sections 1 to 11 of the ideas artifact linked from the issue. The old band's figures are in record 0140.

## Alternatives rejected

- **The count in the Controls sheet's header as well** (section 11's first draft): the maintainer dropped it, 2026-10-21. One badge, on the button that runs the analysis.
- **The badge as a menu trigger shape** (record 0201's chip, bar or field): a count is not a control a reader reads a label off, and a trigger's chevron and hover had no place on a 20px disc. The badge is exempt from `style-menu-trigger` for that reason.
- **Only the badge opens the list from a greyed button**: a reader presses the greyed button to find out why it is greyed, and a press that did nothing was the old block's problem in a new place. The maintainer chose the whole button.
- **A dismissable blocker**: a dismissed blocker left the button greyed with no sign of why, and the next press would have had nothing to open.

## Consequences

`ControlPanel` takes `messages` rather than the dozen inputs it derived them from; `AppDrawer` and `MapStage` thread the same object. `resultsSheet.ts` loses the band's arithmetic and `fabBottomPx` takes two arguments. Every message still fits one line at 360px, now as a line in a box the list draws at the button's width. The e2e `messages.spec.ts` drives the badge at 360, 390 and 1440 wide.
