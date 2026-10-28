# 0232. A failed run opens its messages, and a refused run is a blocker

- Status: Accepted. Amends 0208 (the list opens itself when a run fails, a desk's shut panel opens again around it, and a refusal is a blocker rather than a dismissable line).
- Date: 2026-10-27
- Decider: the maintainer (TJ), on issue #803: option A for M1 (a run that ends in an error or a refusal opens the message list itself), option A1 for M2 (a desk's panel shut when the failure lands opens again, with the list inside it), and a refusal that stands as a blocker until the panel changes. The blocker sentences are the issue's approved strings. The stricter rule for when a refusal lifts (a cleared ring and a shorter list count) is Claude's call, flagged on the PR.
- Issues and PRs: #803, #808, #786, #736, #782
- Cited in code as: #803
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every message is in the one list the Analyze button opens"; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useOpenOnFailure.ts`, `useAnalysisRun.ts` and `usePanelMessages.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx`, `PhoneFoot.tsx` and `AppDrawer.tsx` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts`, `notices.ts`, `panelMessages.ts` and `analysisFailure.ts` bullets; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze
- Related: 0062 (every blocker is named), 0169 (Analyze is the one retry), 0204 (a failed polygon run keeps its found field), 0208 (the badge and the one list), 0210 (every blocker is an error)

## Context

Record [0208](0208-analyze-button-counts-the-messages.md) moved every message into the list the Analyze button's badge opens, and the list opened only on a press. A run that failed added a line to it and nothing else. The maintainer's reported case (#803, 2026-10-22, reproduced in Chrome on production): a 13,825 km² ring with every kind and unnamed peaks found 2,613 destinations against the 1,500 cap. The pod answered 400 in 194 ms, the search overlay closed, and the reader saw a red `1` on the button and reported no error. The button stayed lit and read `Analyze`, so a second press sent the same refused request.

At a desk the reader could also close the panel while the run was up. A shut panel is `inert`, its badge and its live region with it, so every message after that was invisible, to a screen reader too.

## Decision

- **A run that ends in an error or a refusal opens the list** where the badge is: the card over the panel's Analyze at a desk, the Messages sheet on a phone. A cancel opens nothing. `useAnalysisRun` counts failures (`failureSeq`), and `useOpenOnFailure` opens the list once per failure, the same failure twice included. Everything else about the list holds: the badge toggles it, a press outside and Escape close it, it goes with the last message, and the tutorial still holds it.
- **A desk's shut panel opens again** on the same count, and its list opens once the panel stands still (`useHeldFailure`), because the card is placed against the button when it opens and a card placed against a button off the screen stays off it.
- **A refusal is a blocker.** It greys Analyze, reads red on the badge, carries no ×, and is said once, as the blocker, in its own words. It stands while the panel describes the request that was refused (`refusalStands`): the commit cues' comparison against the refused run, as `retryStands` reads it, and two more changes the cues pass over, a cleared ring and a shorter list. A blocker with no way out would be a trap, and a shorter list is the remedy for a list too long. The button never reads `Try again` over it. `dismissEvent` clears the run error alone.
- **A list over the cap is held before Analyze** (D4): the pasted rows and the pins, counted the way a run sends them (`customListSize`), against the published cap, in the over-cap sentence `capDetail` already says. The gate takes it as a general count, so the ring's count joins it later. A `/api/destinations` 422 with no count is a refusal too, so it never offers `Try again`.
- **The other vetoes #803 names are in the gate now**, off until their inputs are wired: the spend, the archive's cloud deck and freezing level, the air-quality horizon, the model's domain and a bound's order, each an error with its approved sentence.

## Evidence

The maintainer's report and calls on issue #803, 2026-10-22 to 2026-10-27. The production refusal body is in the issue. `frontend/e2e/failureOpens.spec.ts` drives the reported answer at a desk, with the panel closed mid-run, and on a phone. `analyzeGate.test.ts` holds the gate's postcondition over every combination of its sixteen flags.

## Alternatives rejected

- **Keep the overlay up with the sentence** (the issue's other M1 option): a second place a failure is said, beside the list record 0208 made the one place.
- **Open the card at once, with the panel still sliding in**: the card is fixed where it was placed, and it would stand where the button was, off the screen, until something re-placed it.
- **Lift a refusal on the commit cues alone**, as `retryStands` does: a cleared ring and a shorter list leave the cues silent, so a reader who did the right thing stayed held.

## Consequences

`PanelMessages` carries `failureSeq`; `AppDrawer` hands its panel a copy with the count held while a desk's panel is shut or moving. The refusal's event row is gone from `panelMessages`, `EventNoticeKind` is `error` alone, and the old `refusal:` keys name nothing. `usePanelMessages` takes the refused run's snapshot, the panel as `refusalStands` reads it, the list's size and the cap. A failure moves the keyboard into the card when the card has a × to take it, as any opened menu does.
