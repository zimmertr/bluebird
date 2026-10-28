# 0208. The Analyze button counts the messages and opens the one list

- Status: Accepted, amended by 0232 (a failed run opens the list itself, a desk's shut panel opens again, and a refusal is a blocker). Supersedes 0140 (no notice band on a phone's map). Amends 0028 (every message is in one list, the list the Analyze button's badge opens, rather than one block under the button) and 0207 (the Analyze button is the one thing on the foot of a phone's map, and no band rides the Controls sheet's edge).
- Date: 2026-10-21
- Decider: the maintainer (TJ), on issue #786, from the combined mockup (section 11 of the ideas artifact, 2026-10-21), with four calls the same day: the badge on the Analyze button alone, not beside a phone's theme switch; a greyed button opens the list from a press anywhere on it; the badge wears the worst severity's colour; the phone's sheet is headed Messages. On reviewing the build the same day the maintainer dropped the mockup's blocker lines under their fields: "it doesn't look good. Lets just display them in the Analyze badge." The blocker's lack of a × is Claude's call, flagged on the PR.
- Issues and PRs: #786, #789, #253, #696, #123
- Cited in code as: #786
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every message is in the one list the Analyze button opens"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx`, `PhoneFoot.tsx`, `MessageBadge.tsx` and `MessageList.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `usePanelMessages.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `panelMessages.ts`, `notices.ts` and `resultsSheet.ts`, `tourSteps.ts`; [`docs/STYLES.md`](../STYLES.md), Every message is a box, Phone chrome; [`docs/USAGE.md`](../USAGE.md), On a phone, Analyze, the tutorial

## Context

Record [0028](0028-notices-below-analyze.md) put every message in one block under the panel's Analyze button, and record [0140](0140-phone-notices-on-the-map.md) moved that block onto a phone's map, in a band on the results sheet's edge under the button, three lines tall and scrolling past them. The maintainer's review of the desk design (#714) found the result wanting on both widths (#786). At a desk the block pushed the panel's footer about with every line that came and went. On a phone the band showed one message and no sign of the rest, so a reader with four of them read the first and scrolled a 66px strip for the others.

Ten mockups were drawn and one combined design chosen, 2026-10-21.

## Decision

- **The Analyze button counts every message** in a badge at its corner (`MessageBadge`): the count, in the worst severity's colour, error over warn over info (`worstSeverity`), the digit in the panel's colour so it clears AA on the fill in both themes (`styles.test.ts`). A badge is the one summary a reader gets without a press, so it says how many and how bad, and nothing else. The same badge on the panel's button at a desk and on the map's button on a phone; nowhere else, and not beside a phone's theme switch.
- **A press on the badge opens the one list** (`MessageList`): the severity boxes of record 0028, in error, warn, info order, every message whole with its × unless it is a blocker, on the one menu (record [0201](0201-one-menu-for-every-trigger.md)). At a desk it is a card over the button, at least the button's width; on a phone, a bottom sheet headed Messages. The list goes with the last message.
- **A greyed button is live.** A blocker greys the button with `aria-disabled` rather than `disabled` (`BLOCKED`), and a press anywhere on it opens the list, since the list is where every reason is. Busy stays `disabled`: a run is the button's own news, with nothing to act on. The gate itself does not change: `analyzeEnabled` is what it was.
- **A blocker is never dismissed.** It stands until the reader supplies what it asks, and a dismissed one would leave a greyed button with nothing to say for itself. The × stays on every other message, and the ledger of record [0028](0028-notices-below-analyze.md) is unchanged for them.
- **One live region**, `MessageRegion`, mounted for good beside the badge and holding every current message out of sight, so a screen reader hears a message as it arrives whether or not the list is open. The list announces nothing itself (`style-message-list`, `style-live-region`).
- **The tutorial points at the badge** in a card of its own after the Analyze card, in words the maintainer picked (2026-10-21): "The number on Analyze counts messages about your settings. Select it to read them. While Analyze is greyed out, something must be fixed before it can run, and the messages say what." It runs on a demonstration whatever the reader's own state (the maintainer, the same day: "It should fake some messages"): Analyze greyed under a red 2 and the list open, holding the date blocker and the air-quality note, both from `panelMessages` itself (`tour/demoMessages.ts`).
- **The block and the band are gone.** `PanelFooter` draws the button, the badge and the links; `PhoneFoot` the button and the badge; `App.tsx` derives the messages once (`usePanelMessages`) for both widths. `CONTROLS_MAP_PX` keeps its 256, so the Controls sheet opens where it did; the 76px the band had above it is the maintainer's to take back.

## Evidence

The calls, issue #786 and PR #789, 2026-10-21. The mockups, sections 1 to 11 of the ideas artifact linked from the issue. The old band's figures are in record 0140.

## Alternatives rejected

- **A blocker's sentence under the field it validates as well**, a dot in its severity's colour and the line with no box, the way the draw counter reads beside the polygon (section 11 of the mockups). Built on PR #789 and dropped by the maintainer on review the same day, before it merged: the lines did not look good under the fields. The list holds every blocker, and the badge on a greyed button reads red (record [0210](0210-blockers-are-errors.md)).
- **The count in the Controls sheet's header as well** (section 11's first draft): the maintainer dropped it, 2026-10-21. One badge, on the button that runs the analysis.
- **The badge as a menu trigger shape** (record 0201's chip, bar or field): a count is not a control a reader reads a label off, and a trigger's chevron and hover had no place on a 20px disc. The badge is exempt from `style-menu-trigger` for that reason.
- **Only the badge opens the list from a greyed button**: a reader presses the greyed button to find out why it is greyed, and a press that did nothing was the old block's problem in a new place. The maintainer chose the whole button.
- **A dismissable blocker**: a dismissed blocker left the button greyed with no sign of why, and the next press would have had nothing to open.

## Consequences

`ControlPanel` takes `messages` rather than the dozen inputs it derived them from; `AppDrawer` and `MapStage` thread the same object. `resultsSheet.ts` loses the band's arithmetic and `fabBottomPx` takes two arguments. Every message still fits one line at 360px, now as a line in a box the list draws at the button's width. The panel's body draws no message at all: a blocker is read in the list, from a press on the greyed button. The e2e `messages.spec.ts` drives the badge at 360, 390 and 1440 wide.
