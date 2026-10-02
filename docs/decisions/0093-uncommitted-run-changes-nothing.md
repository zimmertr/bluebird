# 0093. A run that does not finish changes nothing

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #560 (half 1 as the issue planned; for half 2, neither of the issue's options: the previous report comes back exactly)
- Issues and PRs: #560, #613
- Cited in code as: #560, in `hooks/useAnalysisReport.ts`, `hooks/useAnalyzeCommand.ts`, `hooks/useAnalysisRun.ts`, `hooks/useAnalyze.ts`, `hooks/useForecastGrid.ts`, `hooks/useModelCompare.ts`, `hooks/useResultsLayout.ts`, `hooks/useClosePopupsOnCommit.ts`
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "The data snapshot is refined, not broken"; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalysisReport.ts` and `useAnalyzeCommand.ts` bullets

## Context

An analysis ends one of three ways: it commits, the reader presses Cancel, or it fails. Before this record all three resolved the same way. `useAnalysisRun.run` caught every error and `useAnalyze.analyze` returned nothing, so the Analyze click could not tell them apart.

That broke two things.

1. The click wrote the discovery record (`DiscoveryRecord`, what a later Analyze reads to decide whether it may refresh) after the run on every outcome, and cleared the ×-removals before the run. After a cancelled or failed search of a new ring, the next Analyze read the new ring as already searched, refreshed the old ring's field with no polygon, stamped the snapshot with the new ring's keys, and the `polygon-changed` cue went quiet. The new ring was never searched. The removals were gone for a report that never arrived. Measured on production on 2026-10-01: a disjoint ring B showed ring A's 29 rows after Cancel then Analyze, where a fresh run of ring B finds 3 different peaks.
2. Partial rows (#337) set `response`, `universe` and `analyzed` as they arrived. A run that stopped kept them, so a subset stood as the report under a snapshot that let the next Analyze refresh only the rows that had arrived. A cancelled 300-row paste read "(200 of 200)", with no "so far" and no cue.

## Decision

A run that does not finish changes nothing.

- `useAnalysisRun.run` resolves true only when the run's body finished, and `useAnalyze.analyze` returns that.
- The click's bookkeeping, the discovery record and the removal clear, runs when the run commits and not otherwise. It rides on the run's options as `onCommit`, which `useAnalyze` calls in the same render as the commit, so a retry's commit (Try again replays the request and its options) applies it too. A record written before the run, for a click made while it is in flight, goes back to the one before it when the run does not commit.
- `useAnalysisReport` keeps the last committed report apart from the state partial rows overwrite. A cancel or a failure puts it back: the same `response`, `universe` and `analyzed` objects, and the candidate field it published for the wildfire and closure checks. The partial rows are discarded. With no report before the run, the screen returns to the no-report state. `analysisSeq` never moved for the run, so nothing keyed on it fires: popups stay, the map does not reframe, the table's detail sort and the forecast player's playhead keep their place.
- What else read the arriving snapshot is held to the same rule:
  - The forecast grid fetches nothing while rows arrive. A lattice fetched for an arriving snapshot was held under the sequence of the report a cancel put back, and its ratchet served that lattice under the old report's markers.
  - The model comparison buys nothing while rows arrive. A commit drops what it holds anyway, and a pair bought under another window would have stayed beside a report it does not answer.
  - The results layout narrows back to Table when a first run's rows go without a commit, because the first rows widen a desktop to Both before anything commits.
  - Map popups close when a run that had shown partial rows is discarded, as they do on a commit (record 0088): a card opened over a partial row names a row the report put back may not hold. A separate counter, `discardSeq`, moves for that and nothing else, because `analysisSeq` must not move for a run that never committed. A run discarded before any row arrived showed nothing new, so the cards over the standing report stay open.
- The per-location forecast cache (`forecastStore.ts`) keeps what the stopped run fetched. Its entries are keyed by the request that produced them (location, window, model, elevation, endpoint) and expire on the same 15 minutes as before, so a later run that asks the same question may use them under the existing rules. They describe no report. The held field a re-analysis reuses (`forecastReuse.ts`) is set only on a commit, so it still belongs to the report put back.

## Evidence

The Round 5 readiness review, 2026-10-01: a Vitest probe over the real `useAnalyze` and `useAnalyzeCommand` failed all three correct-behavior assertions, and the production measurements above. Findings D3-1, D3-2, R-C08-1, R-C08-2, A3, V1-1 (check 7), P39-1 and D16-4. The probe is now `useAnalyzeCommand.test.tsx`, "a run that does not commit changes nothing", for a cancel and a failure in each half, and `frontend/e2e/cancel.spec.ts` drives it in the built image.

## Alternatives rejected

- Restore only the previous `analyzed` snapshot and keep the partial rows (#560 option A). The cue speaks again, but the rows that arrived sit beside a snapshot that does not describe them.
- Keep the partial snapshot and mark the field as not eligible for a refresh echo (#560 option B). The screen keeps what the reader saw arrive, but nothing on it says rows are missing.
- Bump `analysisSeq` on the restore so every surface resets. It would reframe the map, reset the table's sort and the player's playhead, and close popups even after a run that showed nothing new, for a run that, by this rule, changed nothing.

## Consequences

The rows a reader watched arrive vanish when they press Cancel. That is the point: they were never a report. Nothing on screen says the run stopped beyond the overlay going away, as before; a failure still shows its error.

While rows arrive the grid keeps the previous report's lattice and comparison lines for the rows they still match. Both catch up when the run commits.
