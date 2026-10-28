# 0204. A polygon run's found destinations show as pending rows, and a forecast failure keeps them

- Status: Accepted. Amends 0093 (a failed polygon run's found field stays on screen as pending rows). Extended by 0235 (a field counted before Analyze is reused the same way, and a cleared ring or no kind left releases a failed run's field).
- Date: 2026-10-21
- Decider: the maintainer (TJ), on issue #782: the issue's option A on 2026-10-20 ("populate the results table with placeholders and then perform the forecast lookup... This is what we do with searched destinations, map-clicked destinations, and CSV input destinations"), and its details on 2026-10-21.
- Issues and PRs: #782, #560, #736
- Cited in code as: #782, in `hooks/useAnalyze.ts`, `hooks/useAnalysisRun.ts`, `hooks/usePresentedReport.ts`, `utils/analysisPipeline.ts`, `utils/customList.ts`, `components/ResultsTable.tsx`, `components/ResultsTableRow.tsx`, `map/resultsLayer.ts`
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "The data snapshot is refined, not broken"; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useAnalyze.ts` and `usePresentedReport.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analysisPipeline.ts` and `customList.ts` bullets; [`docs/USAGE.md`](../USAGE.md), What happens when you analyze
- Related: 0003 (Analyze is a spend boundary), 0093 (a run that does not finish changes nothing), 0169 (Analyze is the one retry)

## Context

A polygon run is a discovery (`POST /api/destinations`) and then the forecasts. Nothing it found reached the table or the map until forecasts landed, and a forecast failure put the previous report back (0093) with the found field gone. Try again then searched the ring again. A pasted, searched or clicked destination is an input, so it shows as a pending row and a neutral dot before any analysis and stays through a failure. A ring's destinations are found inside the run, so nothing outside the run held them.

## Decision

- **Found destinations show the moment discovery answers**, the way the reader's own pending destinations do: the same `PendingRow` in the same block above the ranked rows, a dash in every metric, the neutral `PENDING_COLOR` dot, the same fly-to. A found row has no ×, because the ring put it there and the reader did not. No string, style or tooltip is new, and the results bar's count leaves pending rows out, as it always has.
- **Each leaves the block when the universe holds it**: its forecast landed mid-run, or the run committed.
- **A forecast failure keeps them.** The previous report comes back exactly, as 0093 says, and the found field stays beside it as pending rows and dots, less any row that report ranks, the reader removed, or the reader named too. It stays until the next run starts or a reset. A redrawn ring or changed types raise the existing cues and leave it in place.
- **A cancel drops it with the run.** For a cancel, 0093 is unchanged.
- **Try again forecasts the held field without searching again.** So does any Analyze whose ring, kinds with the unnamed-peaks toggle (`polygonKey` and `typesKey` from `discoveryKeys`) and custom list by `geoKey` equal the failed run's. Any other request discovers afresh. The button still builds a fresh request through the gate (0169); the pipeline takes the held field as `found` in place of `POST /api/destinations`, as it takes held forecasts.
- **Found rows are not inputs.** The `destination-added` cue and `retryStands` count the reader's own pending rows only.
- **`present.ts` is unchanged.** Found rows never enter the universe.

## Evidence

The maintainer's run on 2026-10-20 at 21:13 PDT: a 1,632 km² ring near Leavenworth with every kind and unnamed peaks ticked. Discovery found 262 destinations, the forecast fetch tripped Open-Meteo's per-minute limit, and the panel said `Open-Meteo is rate-limiting. Try again later.` over an empty map.

`frontend/e2e/pendingField.spec.ts` drives the change in the built image: a daily-limit 429 from Open-Meteo leaves the ring's five destinations in the table with dashes and no × under `Open-Meteo quota reached. Try again later.`, and Try again ranks all five on the one `POST /api/destinations` the first press made. `useAnalyze.test.tsx` pins the field's life (failure, cancel, commit, reset) and the reuse rule, `usePresentedReport.test.tsx` the merge and the cue's count, and `analysisPipeline.test.ts` the skipped call.

## Alternatives rejected

- **Hold the field for Try again alone, with no pending rows** (the issue's option B). The reader still sees nothing of what the ring holds, which was the complaint.
- **Fetch forecasts in ranked pages and commit each page** (option C). A ranking needs every candidate's number before it can cut a page, so the first page lands no sooner than the whole field, and paging reopens the no-silent-sampling rule.
- **Put the pending rows in the universe and sort them last** (the issue's own plan for A). Every surface that reads `present.ts` would have to tell a row with no forecast from one with null metrics, and the count would include rows nothing forecast. The pending block already draws rows with no forecast for three sources, outside the ranking.
- **Keep the field through a cancel too.** A cancel is the reader saying stop, and 0093's rule that it changes nothing stands.

## Consequences

`RunHooks.onFailure` is told the failure's kind, which is how a cancel is told from a failure. `PendingDestination.source` has a third value, `polygon`, whose `kind` is the row type discovery gave, so `pendingLinkRow` links a found crag to Mountain Project as its ranked twin does. `usePresentedReport` returns `customPendingCount` beside `pending`, and `App.tsx` feeds the cue from it.

After a failure the table can hold up to the candidate cap of pending rows above the report that came back, and the chart and the CSV download carry them as they carry pasted ones. For 15 minutes Try again buys nothing the failed run fetched before it failed, since the per-location cache keeps it (0093).
