# 0169. Analyze is the one retry: it reads `Try again` after a failed run, and the error box carries no button

- Status: Accepted. Reverses the 2026-08-22 placement of one `Try again` per error box, at its bottom, which had no record and lived in a `PanelFooter.tsx` comment.
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #736, 2026-10-16: one action button, Analyze, that becomes whatever the app needs next. For this issue, the failure state only; the label changes and the fill does not; the word reverts on any input change, a dismissal or the next run; the button builds a fresh request through the gate instead of replaying the failed one.
- Issues and PRs: #736, #253 (dismissal), #560 (an uncommitted run changes nothing), #696 (the phone's floating button)
- Cited in code as: #736
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Every notice renders in the one block under the Analyze button"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PanelFooter.tsx` and `PhoneFoot.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalyze.ts` and `useAnalysisRun.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts`, `notices.ts` and `analysisFailure.ts` bullets; [`docs/STYLES.md`](../STYLES.md); [`docs/USAGE.md`](../USAGE.md)
- Related: 0028 (the one notice block), 0093 (a run that does not finish changes nothing), 0135 (the phone's floating Analyze), 0140 (the block stands on a phone's map)

## Context

A failed run put a red `Try again` at the bottom of the error box, directly under Analyze. Two buttons a few pixels apart both started the analysis over, and they did different things. `Try again` replayed the failed run's exact request from a ref in `useAnalyze`, so after the reader changed the window or the model it ran a request the panel no longer described. It was disabled only during a run, so with the ring removed after a failure it still fired while Analyze was shut. On a phone the box stands in the band on the map, so the button cost the band a row and lifted the floating Analyze by the same amount.

## Decision

- **The Analyze button is the one retry.** After a transient failure it reads `Try again`, on the panel at a desk and on the map's floating button on a phone, in the same fill. The error box holds its line and its dismiss control and no button that runs anything. `BUTTON_DANGER` and the four `danger-fill`, `-hover`, `-edge` and `-label` tokens went with it; `danger-tint` and `danger-line` stay, since the box wears them.
- **The word is one pure derivation**, `actionWord` over `retryStands` in `utils/analyzeGate.ts`, decided once in `App.tsx` and handed to both buttons. `Try again` stands while three things hold: the failure was transient (`retry` on the run error, which a model-coverage failure does not carry), the error has not been dismissed, and the panel still describes the request that failed. That last test is `panelCommitCues` over the failed run's snapshot, so the word reverts for the same changes that stale a report: the model or a compared model, the window or its arm, the ring, the types, the unnamed-peaks toggle, a destination the run never saw. A changed sort or bound re-presents held rows and keeps the word. `useAnalyze` keeps that snapshot as `failedView`, because a failure puts the committed report back untouched (0093) and the report's snapshot cannot say what failed.
- **Pressing it is pressing Analyze.** It runs what the panel says through the panel's gate. The replay path (`retry`, `lastRequestRef`, `onRetry` through four components) is gone. Under the revert rule the two requests are the same whenever the word shows, and the gate holds the retry as it holds every run.
- **Dismissing an event line clears the event.** The run error and the refusal are state a run set, so their dismissal calls `useAnalysisRun.dismissEvent`; the line goes, the word reverts in the same render, and the next run sets the event afresh if it fails the same way. The ledger keeps the derived lines, keyed on their conditions. One consequence: the lines the panel holds back while an error shows (the air-quality note, the kinds a report is without) return once the error is dismissed, since they describe the report on screen.
- **A model-coverage failure and a refusal leave the button reading `Analyze`.** Both fail the same way on a second request, and their sentences name the remedy.

## Evidence

Measured 2026-10-17 in Chrome on the maintainer's Mac, against images built from `main` at b6d1ade and from this change, with the Open-Meteo fetch made to fail from inside the page, one pinned destination, the current hour.

| Surface | Before | After |
|---|---|---|
| Desk footer at 360px, error showing, dark and light alike | 189px, the box 76 | 151px, the box 38 |
| Phone band at 390x844, dark and light alike | 76px tall, the floating button at 408 to 464 | 38px tall, the button at 436 to 492, 16px over the band |
| Floating button width | 118.9px | 118.9px (`Try again` at 14px semibold is narrower than `Analyzing…`) |

The revert rule, in the same session on the built change: after the failure the button read `Try again` and was lit. Switching When to Dates read `Analyze`, greyed by the dates blocker. Switching back read `Try again`. Pressing it failed again and read `Try again`. Dismissing the line read `Analyze` with no box. Restoring the fetch and pressing read `Analyzing…`, then `Analyze` over one ranked row. `analyzeGate.test.ts` pins each revert, `useAnalyze.test.tsx` the snapshot and the dismissal, and `PanelFooter.test.tsx`, `ControlPanel.test.tsx` and `PhoneFoot.test.tsx` the button and the box.

## Alternatives rejected

- **Remove the box's button and change nothing else** (the issue's option A). The failure then offered no action, and the maintainer asked for one button that says what it does next.
- **A red Analyze** (option B2). Red marks the destructive button inside a notice in this app, and a retry is not destructive. It also needed a new fill measured in both themes against the panel and the sheet.
- **Cancel while running and Done while drawing on the same button.** The maintainer kept this change to the failure state. The progress card keeps Cancel; the Polygon row and the phone's draw bar keep Done.
- **Replay the failed request.** Kept the stale-request case above and skipped the gate.
- **Lift the dismissal ledger to `App.tsx`** so the button could read it. Three more props through the drawer and the panel for one bit, where clearing the event is what a dismissed event means.

## Consequences

`PanelFooter`, `PhoneFoot` and `MapStage` take the word in place of a loading flag; `ControlPanel` and `AppDrawer` take it and `onDismissEvent` in place of `onRetry`. `FooterMessage` carries no `retry`. `useAnalyze` returns `failedView` and `dismissEvent` and no `retry`. The phone's button reserves every word in `ACTION_WORDS`, so a fourth word joins that list. Issue #714's open question, one Analyze or two on a desk, is unchanged: whichever it is reads the same word.
