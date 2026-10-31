# 0260. A new message moves the badge, and a check or basemap failure opens the list

- Status: Accepted. Amends 0208 (the badge moves once when a message arrives) and 0233 (a check or basemap failure opens the list as a failed run does, and at a desk leaves the keyboard where it is).
- Date: 2026-10-30
- Decider: the maintainer (TJ), on issue #834, from the lab of five badge animations (`EwcMjxKPgjsnsWEfSojbtz`), the same day: options C and D together; the check failures and the basemap failure open the list, the partial air-quality line and the share-link lines do not; a desk's shut panel opens again for them; the keyboard stays where it is at a desk and goes into the sheet on a phone, because the sheet is modal; bump and ripple together, on any new message rather than only when the count goes up. Claude recommended bump alone, on a rising count; the maintainer chose the louder pair.
- Issues and PRs: #834, #803, #808, #786
- Cited in code as: #834
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every message is in the one list the Analyze button opens"; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useMessageArrivals.ts`, `useOpenOnFailure.ts`, `usePanelMessages.ts` and `usePopover.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MessageBadge.tsx`, `PanelFooter.tsx` and `PhoneFoot.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `panelMessages.ts`; [`docs/STYLES.md`](../STYLES.md), the badge and Motion; [`docs/USAGE.md`](../USAGE.md), On a phone and What happens when you analyze
- Related: 0207 (a phone's sheets are modal), 0208 (the badge and the one list), 0233 (a failed run opens the list)

## Context

Record [0233](0233-a-failed-run-opens-its-messages.md) opened the list for a failed run because a reader took a red `1` on the button for no error at all. Every other message still arrived as a changed digit and nothing more. For most of them that is the right size of news: a blocker, a stale-report cue or a window line answers a change the reader just made in the panel. Three lines are different. A wildfire or closure check that fails after a run, and a basemap that will not load, are caused by nothing the reader did, and they are the lines the reader would least think to look for.

## Decision

- **Every new message moves the badge once** (`MESSAGE_BADGE.arrival`): the disc swells to 1.35 and settles over 320ms, while a ring in its own colour spreads to 2.6 times its size and fades over 700ms. "New" is a key the list did not show the render before, after dismissals (`useMessageArrivals`), so one blocker giving way to another while a ring is drawn moves it, and a line the reader dismissed does not move it again while its condition holds. The messages at mount are taken as seen, so a fresh page's blocker does not move it. Under a reduced-motion setting nothing moves.
- **A check or basemap failure opens the list** (`LIST_OPENING_KEYS`: `fire:unavailable`, `closure:unavailable`, `map:style`), keyed on `openingSeq` through the same `useOpenOnFailure` a failed run uses, and a desk's shut panel opens again for it as for a failure (`useHeldFailure` holds both counts).
- **At a desk the keyboard stays where it is** (`usePopover`'s `takeFocus`), because the line can land while the reader is typing in a field. A press on the badge, or a failed run over the open list, takes it into the card as before.
- **On a phone the sheet takes the keyboard.** It is modal (record [0207](0207-phone-controls-sheet-is-modal.md)), and a modal that left the keyboard behind it would leave it on a page a screen reader cannot reach.
- **No new string, and no new surface.** The animation restarts by alternating two names of one keyframe pair (`badge-bump-a`/`-b`, `badge-ripple-a`/`-b` in `index.css`), so it replays on the same element and a keyboard on the badge is never dropped.

## Evidence

The calls on issue #834, 2026-10-30, made in the lab, which played every option against the app's own tokens and messages in both themes at a desk and on a phone. The keys the list opens for are pinned against `panelMessages` in `panelMessages.test.ts`; the arrivals in `useMessageArrivals.test.tsx`; the quiet open and the focus in `PanelFooter.test.tsx` and `PhoneFoot.test.tsx`; the motion and its keyframes in `styles.test.ts`.

## Alternatives rejected

- **Open the list for every new message** (option B): it opened on a fresh page's blocker, on the first point of every ring, and on every calendar or model change after a report, and took the keyboard from the control the reader had just changed.
- **The badge alone, never opening the list** (option D on its own): a moving disc is easier to see than a changed one, and it is still a disc asking to be pressed, which is what #803's reader missed.
- **Open the list for the partial air-quality line and the share-link lines as well**: the maintainer kept those to the badge. The share-link lines would open the list on page load, over a page the reader has not looked at yet.
- **Bump alone, on a rising count** (Claude's recommendation): quieter, and silent for a blocker giving way to another. The maintainer chose bump and ripple, on any new message.
- **A non-modal sheet on a phone that leaves the keyboard alone**: a second kind of sheet beside record 0207's, for three lines.

## Consequences

`PanelMessages` carries `arrivalSeq` and `openingSeq`; the fixture's `panelMessages` gives both 0. `usePopover` takes `takeFocus`, true unless a caller says otherwise. `PanelFooter` holds the list as shut, open, or open quietly. A new line that should open the list joins `LIST_OPENING_KEYS`, which the test holds to the keys `panelMessages` gives those failures.
