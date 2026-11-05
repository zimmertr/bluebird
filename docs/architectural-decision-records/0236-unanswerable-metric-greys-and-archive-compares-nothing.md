# 0236. A metric the window cannot answer greys its row and blocks its ranking, and compared models are ignored on archive

- Status: Accepted. Extends 0027 (the archive endpoint, whose disabled model picker now also sets the comparison aside) and 0117 (a Layers row greys where its layer has nothing to say; a Metrics row now greys the same way).
- Date: 2026-10-28
- Decider: the maintainer (TJ), on issue #803, decisions of 2026-10-27: a metric the source or the model cannot answer greys its rank radio and its bound boxes, the grey row being the whole message with no note and no title, and blocks the analysis when it is the ranking, with a line naming the window; compared models are ignored on an archive window; W8 blocks; W10 stays as record 0072 decided. The approved strings are `No forecast data for this window.` and `Freezing level is only available from the NOAA GFS, NOAA HRRR and DWD ICON models.` Three calls are Claude's, flagged on the PR: a spanning window greys nothing, `Clear filters` still lights for a value only a greyed box holds, and hours narrowed wholly past a model's reach are dropped by the model-change clamp rather than kept and blocked.
- Issues and PRs: #803, #808
- Cited in code as: #803
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", the archive endpoint's sentence on the picker; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `metricReach.ts`, `analyzeGate.ts`, `constraints.ts` and `freezingLevel.ts` bullets; [`frontend/src/utils/model/CLAUDE.md`](../../frontend/src/utils/model/CLAUDE.md), the `modelDomain.ts` and `modelSelection.ts` bullets; [`frontend/src/utils/calendar/CLAUDE.md`](../../frontend/src/utils/calendar/CLAUDE.md), the `calendarBand.ts` and `calendarSelection.ts` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `usePanelMessages.ts` and `useModelCompare.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MetricsTable.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Model, Forecast window, Metrics; [`docs/DATA.md`](../DATA.md), the archive's bullets
- Related: 0013 (the accept edge is not the data edge), 0026 (the freezing level outside the zip), 0062 (every blocker is named), 0072 (the browser joins spans at local midnight), 0113 (the cloud deck), 0233 (a refused run is a blocker), 0234 (each regional model's grid is published)

## Context

Issue #803's audit of the window, the model, the ranking and the bounds (rows W1 to W9) found settings the panel allowed and the data could not answer, each of which ran and said nothing:

- On an archive window the cloud deck and the freezing level are null at every hour (the archive answers its pressure levels and `freezing_level_height` under the unit `undefined`, measured 2026-09-13 and again on the audit). A ranking on either sorted rows in discovery order with no legend, and a bound on either did nothing. Under one of the five models with no freezing level, the line that blocked a freezing-level ranking named the model, in a picker the archive disables.
- Compared models on an archive window each fetched the same reanalysis, because the archive is asked with no `models=`: identical lines under different labels for N times the spend, and the comparison veto on air quality could not be cleared.
- The default ranking, air quality, ran over windows wholly past its horizon on all-null values.
- A bound with its floor above its ceiling, typed or carried by a link, emptied the table and read as `No destinations match these filters`.
- Hours narrowed on HRRR's last band day past the model's reach fetched nothing but nulls, every row was dropped, and the empty table said `No destinations found. Try a larger area.`, which is wrong for a list.
- A ring or a list partly outside HRRR's grid failed its whole batch after spending.
- The freezing-level note named the models in words the picker never used.

## Decision

- **One pure answer says which metrics the selected window and models cannot answer, and why** (`unansweredMetrics` in `utils/metricReach.ts`): the cloud deck and the freezing level on an archive window; the freezing level when any model the analysis would fetch publishes none; air quality when the window starts past its horizon. `analyzeGateFor` computes it and hands it out beside the gate, and the Metrics table reads that same answer, so a row the reader cannot pick and a ranking the gate refuses are one set.
- **A greyed row** has its rank radio, its aggregate menu and both bound boxes disabled, through `CHOICE_ROW`'s disabled state and `DISABLED`, the roles the Layers rows and the model picker already wear. The boxes keep what they hold and bound nothing, since the column is null. The air-quality row's note is off while it is grey: the grey row is the message.
- **A ranking on a greyed metric blocks**, with the line its reason names: the archive's two lines, the air-quality line, or the existing compare line naming the models with no freezing level. On an archive window the archive's line speaks and the compare line does not.
- **A window that spans the archive boundary greys nothing.** Its forecast half is the chosen model's and answers the cloud deck and the freezing level, and the seam line already names where that half begins (record 0072).
- **Compared models are ignored on an archive window** (`comparedInPlay`): the gate counts the ranking model alone, so neither comparison veto can stand on a disabled picker; the comparison fetches and draws nothing over an archive report; the Models menu lists the ranking model alone; and the table's Model column reads a dash rather than the picker's model, which produced none of those numbers. The selection itself is kept, in the link too, and returns when the window leaves the archive.
- **A floor above its ceiling blocks** (`invertedFamilies`), with its two boxes marked `aria-invalid`. The panel has no invalid look for a field, so the line is what says it on screen. A pair only a greyed box holds does not block, since no one can edit it.
- **A regional model whose published grid leaves out a point to analyze blocks** (`modelOutsideDomain`, record 0234's `domain`), naming the first such model, the ranking model first. The points are the ring's vertices when the ring is searched, every pasted row and every pin, as one array the found field can join. A ring with a vertex outside is held whatever it would find. An archive window names no model, so it never holds there.
- **A window that starts after the model's last hour is out of range** (`classifyWindow`), so the existing `${model} does not reach that far.` blocks it; one that only runs past the reach keeps its early hours, as the band's partial last day always has. The model-change clamp (`clampSelection`) drops narrowed hours that the reach leaves wholly empty, leaving the whole last day, and warns that the model shortened the window.
- **The empty table says `No forecast data for this window.`** when destinations were found and every one was dropped for empty hours.
- **The freezing-level note names the models by the picker's labels**, composed from `FREEZE_MODELS`, the table the gate's list is now read from; a test holds each label to the backend's `MODEL_INFO`.

## Evidence

The audit's traces on #803 at `0f121ea` and the maintainer's decisions of 2026-10-27. The archive's null columns: measured 2026-09-13 (record 0027) and on the audit. `metricReach.test.ts`, `analyzeGate.test.ts`, `MetricsTable.test.tsx`, `modelDomain.test.ts`, `calendarBand.test.ts`, `calendarSelection.test.ts`, `usePresentedReport.test.tsx`, `useModelCompare.test.tsx` and `freezingLevel.test.ts` hold each row. Screenshots of the greyed rows in both themes are owed on the PR.

## Alternatives rejected

- **A note on a greyed row** saying why: a `title` does not exist on touch (record 0064), and the Layers rows set the pattern of a grey row as the whole message.
- **Blocking a spanning window's cloud deck and freezing level**: they answer the forecast half, which is what the seam line tells the reader.
- **Leaving `Clear filters` dark for a value only a greyed box holds**: a disabled box cannot be emptied any other way, so the number would stand on screen with no way to remove it.
- **Keeping narrowed hours past the reach through a model change and letting the window warning block them**: the clamp's standing call is to refit rather than refuse (record 0013's band), and the whole last day has data.
- **Labelling archive rows with a word for the archive**: a new string, not approved; the dash is true and needs none.

## Consequences

`analyzeGateFor` takes `source`, `aqiCoverage`, `constraints` and `points`, each optional, and returns `unanswered`; `usePanelMessages` derives the source and the coverage before the gate and hands `unanswered` to the panel. `PanelMessageState` carries the bounds and the points. `MenuSelect` takes `disabled`. `FAMILY_BOUNDS` in `constraints.ts` is the one table of each metric's two bounds, read by the Metrics table and by the order check. `pointInOutline` in `fireProximity.ts` is the one test of a published outline, for the WFIGS coverage and a model's grid.
