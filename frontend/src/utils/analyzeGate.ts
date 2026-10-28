import { familyOf } from '../metrics'
import type { AnalyzedView, RunError } from '../hooks/analyzeTypes'
import type { DiscoveryType, SortBy } from '../types'
import { type ForecastSelection, hasDates } from './calendarSelection'
import { modelsWithoutFreeze } from './freezingLevel'
import { type OrderedModel, selectedIds } from './model/modelSelection'
import { type PanelState, panelCommitCues } from './present'

// Whether the Analyze button should be enabled.
//
// There are three ways to give Analyze something to do, and they're additive:
//   - A *drawn polygon* — discovers destinations of the chosen type inside it.
//     The app's core query.
//   - A *custom-CSV list* — unioned into the same ranked report, with or
//     without a polygon.
//   - A *pinned search* — one or more places searched and pinned to the table.
//     A pin alone enables Analyze too, which then just refetches the pinned
//     forecasts onto the currently-set window.
//
// Any input enables the button, but the shared guards veto them all: the
// forecast window must be servable, and any drawn polygon must be within the
// area cap. Keeping this as a pure function (rather than inline JSX) is what
// lets it be unit-tested — the frontend suite runs in a bare node environment
// with no component rendering.
//
// The one "is the window set" guard left is `datesPending`: the Dates arm
// freshly opened holds no dates at all (#242 review — today is outlined, not
// selected), so there is no window to analyze until a day is picked. Every
// other selection shape always holds a window (#166).
export interface AnalyzeGate {
  hasWindowWarning: boolean
  // The Dates arm is live with nothing picked yet.
  datesPending: boolean
  loading: boolean
  areaTooLarge: boolean
  // A polygon that is drawn, inside the area cap, AND has at least one type
  // checked. Without a type it discovers nothing, so it is not an input:
  // letting it enable Analyze would send a request the server answers with
  // "nothing to analyze".
  polygonReady: boolean
  hasCustom: boolean
  hasPins: boolean
  // The two ways a model selection and a ranking can contradict each other.
  // Both veto rather than warn, because the report they would buy cannot
  // answer the question the panel is set to ask, and a reader who has picked
  // several models has said what they want compared.
  //
  // Air quality comes from one source whatever model ranks the field, so a
  // comparison there could only draw one answer several times.
  compareAqi: boolean
  // Five of the eight models publish no freezing level, so a comparison there
  // draws most of its lines as columns of nulls. `freezingLevel.ts` owns which
  // ones, and why that has to be a list rather than read off the data.
  compareFreeze: boolean
}

/**
 * Whether the drawn ring is one a polygon search can use: three points or
 * more, inside the area cap. The type checkboxes read this too, and stay
 * greyed until it holds (the maintainer, 2026-10-15, on PR #731): a type with
 * no usable ring discovers nothing, and a box that could be ticked then said
 * otherwise. One spelling, so the boxes and Analyze cannot disagree about
 * which ring counts.
 */
export function ringUsable(drawPointCount: number, areaTooLarge: boolean): boolean {
  return drawPointCount >= 3 && !areaTooLarge
}

export function canAnalyze(g: AnalyzeGate): boolean {
  if (g.hasWindowWarning || g.datesPending || g.loading || g.areaTooLarge) return false
  if (g.compareAqi || g.compareFreeze) return false
  return g.polygonReady || g.hasCustom || g.hasPins
}

/**
 * The gate from the panel's own inputs, which is the one way to build it.
 *
 * The panel's Analyze and the map's (on a phone, #696) are one command, so they
 * open and close together: both build the gate here from the same inputs, and
 * a second spelling of any flag would be a second Analyze that could open while
 * the other one is shut. `freezeGaps` comes back beside it because the panel
 * names those models in its line, and it is the same derivation.
 */
export interface AnalyzeGateInputs {
  selection: ForecastSelection
  hasWindowWarning: boolean
  loading: boolean
  polygonAreaKm2: number | null
  maxAreaKm2: number
  drawPointCount: number
  destinationTypes: readonly DiscoveryType[]
  /** Whether the coordinates box parses to at least one row. */
  hasCustom: boolean
  hasPins: boolean
  sortBy: SortBy
  forecastModels: readonly (OrderedModel & { label: string })[]
  forecastModel: string
  comparedModels: readonly string[]
}

export function analyzeGateFor(i: AnalyzeGateInputs): { gate: AnalyzeGate; freezeGaps: string[] } {
  const areaTooLarge = i.polygonAreaKm2 !== null && i.polygonAreaKm2 > i.maxAreaKm2
  // Every model the analysis would fetch, the ranking one first. The two
  // checks below are pre-flight: they read the picker rather than a report,
  // because their whole point is to refuse to buy an analysis that cannot
  // answer the question the panel is asking.
  const selected = selectedIds(i.forecastModels, i.forecastModel, i.comparedModels).map((id) => ({
    id,
    label: i.forecastModels.find((m) => m.id === id)?.label ?? id,
  }))
  const rankFamily = familyOf(i.sortBy)
  // Named rather than counted: the model is a control in the panel, so the
  // reader can act on a name and cannot act on a fraction.
  const freezeGaps = rankFamily === 'freeze' ? modelsWithoutFreeze(selected).map((m) => m.label) : []
  return {
    gate: {
      hasWindowWarning: i.hasWindowWarning,
      // The Dates arm is live with no day picked yet (#242 review): there is
      // no window to analyze, and the blocker says so.
      datesPending: i.selection.kind === 'days' && !hasDates(i.selection),
      loading: i.loading,
      areaTooLarge,
      polygonReady: ringUsable(i.drawPointCount, areaTooLarge) && i.destinationTypes.length > 0,
      hasCustom: i.hasCustom,
      hasPins: i.hasPins,
      // Air quality comes from one source for every model, so a comparison on
      // it would fetch the same numbers several times and draw one line where
      // the picker shows several chips.
      compareAqi: rankFamily === 'aqi' && selected.length > 1,
      compareFreeze: freezeGaps.length > 0,
    },
    freezeGaps,
  }
}

/**
 * Everything currently holding Analyze back, rather than the first thing.
 *
 * The panel used to pick one reason out of a ternary chain, so a reader with
 * both an oversized polygon and an unservable window fixed the polygon and was
 * met by a second sentence that had been true the whole time. The guards in
 * `canAnalyze` above are independent, so the reasons are too, and the panel
 * stacks whatever this returns.
 *
 * Order is fixed rather than incidental: the two vetoes come first because they
 * are about work already done, and the missing-input line last because it is
 * the one that says the app has nothing to do at all.
 *
 * The polygon has two distinct unfinished states and never both at once. Under
 * three points it is being drawn, and "one more point" is a better instruction
 * than a general one; otherwise there is simply no destination yet. The one
 * case that gets neither line is an oversized polygon, which is a finished
 * polygon and already has its own entry above — a plain "not ready" test there
 * printed "add 0 more points" beside the real reason.
 *
 * The postcondition is that this is non-empty whenever `canAnalyze` is false,
 * so the panel can never disable the button without saying why — with one
 * exception, `loading`. A busy button says it is busy on its own face, and a
 * reader cannot act on the reason anyway, so that is the single disabled state
 * this list leaves to the button. Every other combination of the flags yields
 * a line, including ones the panel cannot actually produce, because
 * "unreachable" is a claim about a caller and this function should not depend
 * on one.
 */
export type AnalyzeBlocker =
  | 'area'
  | 'window'
  | 'dates'
  | 'compare-aqi'
  | 'compare-freeze'
  | 'destinations'
  | 'polygon'
  | 'types'

export function analyzeBlockers(g: AnalyzeGate & { drawPointCount: number }): AnalyzeBlocker[] {
  // Mid-analysis the button is disabled because it is busy, which the button
  // says itself. Nothing here is a reason the reader can act on.
  if (g.loading) return []
  const blockers: AnalyzeBlocker[] = []
  if (g.areaTooLarge) blockers.push('area')
  if (g.hasWindowWarning) blockers.push('window')
  if (g.datesPending) blockers.push('dates')
  // With the vetoes about work already done, and before the missing-input
  // lines: a contradiction between the models picked and the metric ranked is
  // a setting the reader made, not an input they have yet to give.
  if (g.compareAqi) blockers.push('compare-aqi')
  if (g.compareFreeze) blockers.push('compare-freeze')
  if (!g.polygonReady && !g.hasCustom && !g.hasPins) {
    if (g.drawPointCount > 0 && g.drawPointCount < 3) blockers.push('polygon')
    // A finished polygon with nothing checked is not an unfinished polygon
    // and not a missing destination — it is a search with nothing to look
    // for, and only one of the three lines can act on that.
    else if (g.drawPointCount >= 3 && !g.areaTooLarge) blockers.push('types')
    else if (!g.areaTooLarge) blockers.push('destinations')
  }
  return blockers
}

/**
 * A finished ring that will add nothing to an analysis Analyze can still run
 * (#579): no type is checked, so the ring discovers nothing, and a pasted list
 * or a pin keeps the button open. With no other input this is the `types`
 * blocker above; with one it blocks nothing, so it is not a blocker, and the
 * panel shows the same `types` line as information instead. Without it the
 * reader drew a ring, pressed Analyze, and got a report that ignored the ring
 * with nothing said.
 *
 * Only a finished ring: mid-draw the ring is still being made, and the
 * polygon's own counter speaks for it. An oversized ring has its own line.
 */
export function ringAddsNothing(
  g: AnalyzeGate & { drawPointCount: number; drawing: boolean },
): boolean {
  return (
    !g.drawing &&
    g.drawPointCount >= 3 &&
    !g.polygonReady &&
    !g.areaTooLarge &&
    (g.hasCustom || g.hasPins)
  )
}

/**
 * Whether a link that asked for its analysis to run on open (`analyze=1`, #511)
 * should run it now.
 *
 * A link the sender made on purpose is a request, which is the one thing that
 * may cross the spend boundary without a click. It still crosses it only the
 * way a click would: through the same gate the button reads, so an oversized
 * polygon, an unservable window or a compare veto stops it here and the panel's
 * blocker lines say why, exactly as they would for a reader who clicked.
 *
 * It waits for the live capabilities, because the restored window, model and
 * results cap are clamped against them and a run against the fallbacks could
 * buy a report the deployment would not have allowed. `fired` makes it once
 * per page load: the gate closes while the analysis runs and opens again when
 * it ends, and without it that reopening would run the link a second time.
 */
export interface AutoAnalyzeState {
  requested: boolean
  capabilitiesSettled: boolean
  gateOpen: boolean
  fired: boolean
}

export function shouldAutoAnalyze(s: AutoAnalyzeState): boolean {
  return s.requested && s.capabilitiesSettled && s.gateOpen && !s.fired
}

/**
 * The word on the Analyze button (#736). One button starts a run, on the
 * panel at a desk and on the map on a phone, and it says what pressing it
 * does now: `Analyze`, `Analyzing…` while a run is up, or `Try again` after
 * a failed run that is worth repeating. The error box under it used to carry
 * a `Try again` of its own, which replayed the failed request even after the
 * panel had changed and ignored the gate; now the one button is the retry,
 * and it runs what the panel says through the same gate.
 *
 * Listed in full so the phone's floating button can reserve the widest
 * word's width and never resize when the word changes (record 0135).
 */
export const ACTION_WORDS = ['Analyze', 'Analyzing…', 'Try again'] as const
export type ActionWord = (typeof ACTION_WORDS)[number]

/**
 * Whether the last failed run is still worth offering again under its own
 * name: the failure was transient (`retry`), the error has not been
 * dismissed (a dismissed error is null, `useAnalysisRun.dismissEvent`), and
 * the panel still describes the request that failed. The comparison is the
 * commit cues' own (`panelCommitCues`), read against the failed run's
 * snapshot instead of the committed report's, so the word reverts for the
 * same changes that would stale a report: the model, the window, the ring,
 * the types, or a destination the run never saw. A changed sort or bound
 * does not count, since it would not change what the run fetches.
 */
export function retryStands(
  error: RunError | null,
  failed: AnalyzedView | null,
  panel: Omit<PanelState, 'settled'>,
): boolean {
  if (error === null || !error.retry || failed === null) return false
  return panelCommitCues(failed, { ...panel, settled: true }).length === 0
}

/** What the button reads, from whether a run is up and whether a retry stands. */
export function actionWord(loading: boolean, retry: boolean): ActionWord {
  if (loading) return 'Analyzing…'
  return retry ? 'Try again' : 'Analyze'
}
