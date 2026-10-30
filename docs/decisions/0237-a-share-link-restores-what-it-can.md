# 0237. A share link restores what it can and says what it could not, its run on open is decided once, and the grid row greys with nothing to draw

- Status: Accepted. Amends 0117 (a greyed Layers row still ticked can be unticked) and 0016 (the grid row greys before any report).
- Date: 2026-10-28
- Decider: the maintainer (TJ), on issue #803, decisions of 2026-10-27: M3 drops the run-on-open flag, M4 clamps a link's dates on restore, M5 greys the grid row the way the player's greys, M6 adds three info lines, and M8 (the archive's `title` on the grid row) is left as it stands. The three sentences are the issue's approved strings. Which drops count (a garbled ring, list or model id as well as one over a cap), the month arrows paging back from either side, a greyed ticked row staying live for unticking, and the grid's fetch not following the ranking are Claude's calls, flagged on the PR.
- Issues and PRs: #803, #808, #511, #622, #619, #676, #460
- Cited in code as: #803
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the "A map overlay is never a knob at all" paragraph; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useRunOnOpen.ts`, `useLinkDrops.ts`, `usePanelMessages.ts` and `useGridLayer.ts` bullets; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `useForecastSelection.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts`, `panelMessages.ts`, `urlState.ts` and `urlParams.ts` bullets; [`frontend/src/utils/calendar/CLAUDE.md`](../../frontend/src/utils/calendar/CLAUDE.md), the `calendarGrid.ts` bullet; [`frontend/src/utils/forecastGrid/CLAUDE.md`](../../frontend/src/utils/forecastGrid/CLAUDE.md), the `forecastGridLattice.ts` bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the Layers bullet; [`docs/USAGE.md`](../USAGE.md), share links and the Layers menu
- Related: 0016 (overlays are not knobs), 0064 (no tooltip, no unapproved string), 0076 (URL parsing stays tolerant), 0117 (Layers rows grey outside coverage), 0129 (the calendar as a field and a popover), 0208 (the one list), 0233 (a refusal is a blocker)

## Context

Issue #803's audit of share links and layers found five ways a link or a layer reached a state that failed quietly or had no way out.

- **M3.** A link with `analyze=1` that opened blocked kept the flag armed for the session, and spent on the first edit that opened the gate: the first day clicked before a range was picked, or the third point of a redrawn ring. The link's request was spent on a panel the link never described.
- **M4.** A link whose dates lay outside the band (`?mode=days&d1=2027-06-01`) opened the calendar on a month with every day greyed and both arrows disabled, because `monthHasBandDay` bounded each arrow on its neighbour month alone. Only the keyboard, or Current then Dates, got out.
- **M5.** The forecast grid row stood checked and live with no report yet (`?grid=smooth`, or ticked before Analyze), and over a report whose ranked metric was null everywhere. Nothing was drawn and nothing said, against the grid's own rule that a switched-on layer with nothing under it reads as broken.
- **M6.** The decoder dropped a ring over `max_polygon_points`, a `customz` list over the cap, and the ranking model a deployment does not publish, with no word. The ring or list was gone, or the run used the default model and its numbers differed from what was shared.
- **M9.** A Layers row greyed out of view or under an archive report while ticked could not be unticked: the box was disabled with the tick in it.

## Decision

- **The run on open is decided once** (`autoAnalyzeStep` in `analyzeGate.ts`). It waits for the live limits as before. Then the gate open at that moment runs the link, and a gate shut at that moment drops the request. Either way the flag is consumed and leaves the address bar, so a reload does not ask again. Anything the gate learns after the limits settle comes too late for it. The ring's count before Analyze is fetched once they have, so a link whose ring finds more than the cap can still run once and be refused by the pod, which is a blocker since [0233](0233-a-failed-run-opens-its-messages.md). Waiting on the count would hold every ring link on a request the count may never make, where the places table cannot answer.
- **A link's dates are held to the band on restore** (`useForecastSelection`), with `clampSelection`, the way a model change holds them, under the band of the model that ends up ranking, once the deployment's model list has landed. It says nothing more than the window the calendar then shows: the clamp line names a model, and no model change did this. The month arrows page into any month with a servable day and, from a month with none, one step toward the band, from either side (`canPageTo` in `calendarGrid.ts`), so a calendar outside the band always has a way back.
- **The grid row greys with nothing to draw.** `gridAllowed(null)` is false: before any report there is no field to cover. The row also greys over a report whose ranked metric has no number anywhere in the held field (`gridOffered` in `useGridLayer`). Both grey the way the player's row greys, with no `note`. The archive's `title` and hidden description stay, on the archive case alone, as M8 left them. The fetch does not follow the ranking: it is keyed on the report ([0016](0016-overlays-not-knobs.md)), so a ranking with nothing to paint greys the row and hides the legend line while the samples already held wait for a ranking that has numbers, rather than being bought again each time the ranking passes through one with none.
- **A link says what it could not restore.** `decodeLink` returns the state with a `dropped` list beside it: a `poly` or `customz` value the link carried that could not be read or is over the published cap, and a `model=` it could not read. A well-formed model id the deployment does not publish is decided where the published list is, in `useForecastSelection` (`modelLost`). The panel says one info line for each, dismissable and keyed on its condition (`link:ring`, `link:list`, `link:model`):
  - `The link's search area could not be restored.`
  - `The link's destination list could not be restored.`
  - `The link's forecast model is not available here.`

  Each goes when the reader supplies the thing (`useLinkDrops`): a drawn ring takes the ring's line, a pasted list the list's, a model picked the model's. Clearing the ring later does not bring the line back, because that is the reader's own edit. A compared model the list does not offer is still dropped without a word: the chart simply draws the ones there are. Parsing stays tolerant ([0076](0076-api-semver-strict-reader.md)): the rest of the link opens as before.
- **A greyed row still ticked can be unticked** (`LayersPopover.tsx`). Its box stays live, `data-greyed` on `CHOICE_ROW` fades the box alone as far as a disabled row fades and leaves the label at full ink, since the label of a live control owes 4.5:1 and the whole row faded failed axe at 3.14:1 (the maintainer, 2026-10-28), and a press unticks it. Unticked, it is disabled like any greyed row, so it cannot be ticked while the layer cannot draw. A Shift run unticks a greyed row with the rest and never ticks one.

## Evidence

- The issue's audit, traced in code at `0f121ea`: `useRunOnOpen.ts` and the panel's effect re-checked on every change of `analyzeEnabled`; `monthHasBandDay` read the neighbour month only; `gridAllowed(null)` returned true; `decodePolygon` and the `customz` row returned with no record of the drop; `useForecastSelection` fell back to the default model silently.
- `analyzeGate.test.ts` drives a blocked open through a load and the edit that later opens the gate: the request is decided once, as `drop`, and never runs. `ControlPanel.test.tsx` holds the panel to it, `useRunOnOpen.test.tsx` the strip without a run.
- `calendarGrid.test.ts` and `ForecastCalendar.test.tsx` page back from June 2027 toward a band ending in 2026; `useForecastSelection.test.tsx` holds a link's dates to both edges and to HRRR's reach.
- `forecastGridLattice.test.ts`, `useGridLayer.test.tsx` and `LayersPopover.test.tsx` hold the greying, the note on the archive alone, the fetch left on under an empty ranking, and the greyed row that unticks.
- `urlParams.test.ts`, `useLinkDrops.test.tsx`, `panelMessages.test.ts` and `usePanelMessages.test.tsx` hold the drops, their lines and their clearing.

## Alternatives rejected

- **Keep `analyze=1` armed until the gate opens** (as before): the issue's M3. The edit that opens the gate is the reader's, not the link's.
- **Clamp a link's dates against the compiled fallbacks at mount**: the fallback model's reach is not the restored model's, so a second clamp would follow, and a deployment's own limits are what the band is.
- **Grey the grid row only before a report and leave the all-null case drawing nothing**: the issue names both, and a ticked row over an empty picture is the silence M5 is about.
- **Switch the grid's fetch off with the row over an empty ranking**: switching the ranking through freezing level under a model that publishes none would discard the held samples and buy them again on the way back, a spend on a presentation knob.
- **Say a link's ring or list was dropped only when it was over a cap**: a garbled one is as gone, and the sentence says what is true of both.

## Consequences

`decodeState` is `decodeLink`'s state, so every caller that wants only the state is unchanged. `useForecastSelection` takes a third argument, the decoder's model drop, and returns `modelLost`. `usePanelMessages` and `panelMessages` take an optional `linkLost`. `useGridLayer` takes the ranking (`sortBy`) and returns `gridOffered` and `gridArchived`; the linter's `app-grid-gate` holds the grid row to `!gridOffered`. `ControlPanel`'s `onAutoAnalyze` takes `run` or `drop`. A capabilities fetch that fails leaves a link's dates unclamped, as it leaves its model unchecked; the arrows still page back. If the ring's count before Analyze is ever made to shut the gate while it is pending, `autoAnalyzeStep` would drop every ring link that opens before the count lands, so a pending count must leave the gate as it is.
