import type { MultiPolygon } from 'geojson'
import { familyOf } from '../metrics'
import type { AnalyzedView, Refusal, RunError } from '../hooks/analyzeTypes'
import type { DiscoveryType, SortBy } from '../types'
import { type ForecastSelection, hasDates } from './calendar/calendarSelection'
import { discoveryNoun } from './clientAnalyze'
import { type Constraints, invertedFamilies } from './constraints'
import type { WindowSource } from './forecastWindow'
import { modelsWithoutFreeze } from './freezingLevel'
import { type UnansweredMetrics, unansweredMetrics } from './metricReach'
import { type LatLon, modelOutsideDomain } from './model/modelDomain'
import { type OrderedModel, comparedInPlay, selectedIds } from './model/modelSelection'
import { type PanelState, discoveryKeys, panelCommitCues } from './present'

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
  // The last run was refused, and the panel still describes the request that
  // was (`refusalStands`, #803). A refusal is deterministic: the same request
  // is refused the same way, so the button holds until the panel changes.
  refused: boolean
  // The analysis would cover more destinations than the published cap, known
  // before any request: today the pasted list and the pins (#803, D4). The
  // count and the noun the line quotes ride with it, since `capDetail` says
  // both and the limit it was measured against.
  overCap: { found: number; noun: string; limit: number } | null
  // A field whose weighted Open-Meteo cost is past the hourly quota, with
  // both numbers its line quotes (#803, D2): `spendVeto` prices the known
  // count, the window and the models before any request.
  spend: { needed: number; limit: number } | null
  // A ranking on a column the archive does not publish (#803, W1, W2): the
  // metric's row is greyed (`unansweredMetrics`), so this is the ranking the
  // reader set before the window moved there, or one a link carried.
  archiveCloud: boolean
  archiveFreeze: boolean
  // A ranking on air quality over a window wholly past its horizon (W5).
  aqiHorizon: boolean
  // A bound whose minimum is above its maximum, on a metric the window can
  // answer (W7): an inert box's pair is no contradiction anyone can fix.
  boundOrder: boolean
  // A regional model whose published grid leaves out a point the analysis
  // would forecast, by the label its line names, or null (W8). Never on an
  // archive window, which names no model.
  modelDomain: string | null
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
  if (g.refused || g.overCap !== null || g.spend !== null) return false
  if (g.compareAqi || g.compareFreeze) return false
  if (g.archiveCloud || g.archiveFreeze || g.aqiHorizon || g.boundOrder || g.modelDomain !== null) return false
  return g.polygonReady || g.hasCustom || g.hasPins
}

/**
 * The panel as `refusalStands` compares it with the refused run: what
 * `panelCommitCues` reads, and how many destinations the pasted list and the
 * pins come to (`customListSize`).
 */
export type RefusalPanel = Omit<PanelState, 'settled'> & { customCount: number }

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
  forecastModels: readonly (OrderedModel & { label: string; domain?: MultiPolygon | null })[]
  forecastModel: string
  comparedModels: readonly string[]
  /** The refusal the last run ended in, or null (`useAnalysisRun`). */
  refusal: Refusal | null
  /** The snapshot of the run that last failed (`useAnalyze.failedView`). */
  failedView: AnalyzedView | null
  /** The panel as it stands, compared with that run (`refusalStands`). */
  panel: RefusalPanel
  /** How many destinations the pasted list and the pins come to (`customListSize`). */
  customCount: number
  /** The published analysis cap (`useCapabilities`'s `maxDestinations`). */
  maxDestinations: number
  /**
   * How many destinations the ring holds, counted ahead of Analyze
   * (`useDestinationCount`, #803 D1), or null while unknown. Given only while
   * the ring searches; it joins the list's count for the over-cap veto.
   */
  ringCount?: number | null
  /** A field whose weighted cost is past the hourly quota (`spendVeto`, #803 D2), or null. */
  spend?: { needed: number; limit: number } | null
  // What the window, the models and the bounds can answer (#803, W1 to W8).
  // Optional, so a test that gives none builds the gate without them.
  /** Which endpoint answers the selected window (`windowSource`), or null with none. */
  source?: WindowSource | null
  /** How much of the window the air-quality forecast covers (`classifyAqiCoverage`). */
  aqiCoverage?: 'full' | 'partial' | 'none'
  /** The forecast bounds as the panel holds them. */
  constraints?: Constraints
  /** Every point the analysis would forecast (`analysisPoints`), which a regional model's grid is held against. */
  points?: readonly LatLon[]
}

// The over-cap veto's numbers (#803, D1 and D4): the list and the ring's
// count together, against the published cap. The pod refuses the union of
// the two, so the count is what a run would be refused for; a pasted row on a
// destination the ring also finds is one row there and two here
// (`knownCount`).
function overCapOf(i: AnalyzeGateInputs): AnalyzeGate['overCap'] {
  const found = i.customCount + (i.ringCount ?? 0)
  if (found <= i.maxDestinations) return null
  return { found, noun: discoveryNoun(i.destinationTypes, i.customCount > 0), limit: i.maxDestinations }
}

export function analyzeGateFor(i: AnalyzeGateInputs): {
  gate: AnalyzeGate
  freezeGaps: string[]
  unanswered: UnansweredMetrics
} {
  const areaTooLarge = i.polygonAreaKm2 !== null && i.polygonAreaKm2 > i.maxAreaKm2
  const source = i.source ?? null
  // Every model the analysis would fetch, the ranking one first. The checks
  // below are pre-flight: they read the picker rather than a report, because
  // their whole point is to refuse to buy an analysis that cannot answer the
  // question the panel is asking. An archive window fetches the ranking
  // model's request alone, compared models being ignored there (#803, W3), so
  // neither comparison veto can stand on a picker the reader cannot open.
  const selected = selectedIds(i.forecastModels, i.forecastModel, comparedInPlay(i.comparedModels, source)).map(
    (id) => {
      const model = i.forecastModels.find((m) => m.id === id)
      return { id, label: model?.label ?? id, domain: model?.domain ?? null }
    },
  )
  const rankFamily = familyOf(i.sortBy)
  // The metrics this window and these models cannot answer, which the Metrics
  // table greys from the same answer (record 0236). A ranking on one blocks,
  // with the line its reason names.
  const unanswered = unansweredMetrics({ source, aqiCoverage: i.aqiCoverage ?? 'full', models: selected })
  const rankGap = unanswered.get(rankFamily)
  // Named rather than counted: the model is a control in the panel, so the
  // reader can act on a name and cannot act on a fraction. Never on an
  // archive window: the archive's own line speaks there, since the model it
  // would name is in a picker that window disables.
  const freezeGaps = rankFamily === 'freeze' && rankGap === 'model' ? modelsWithoutFreeze(selected).map((m) => m.label) : []
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
      refused: refusalStands(i.refusal, i.failedView, i.panel),
      // Every row of the list is a destination the run would forecast, ring
      // or none, so a list over the cap is refused whatever the ring finds
      // (#803, D4), and the ring's count ahead of Analyze joins it (D1): the
      // pod refuses the union. The noun follows `analysisNoun`: a list makes
      // it `destination`.
      overCap: overCapOf(i),
      spend: i.spend ?? null,
      archiveCloud: rankFamily === 'cloud_deck' && rankGap === 'archive',
      archiveFreeze: rankFamily === 'freeze' && rankGap === 'archive',
      aqiHorizon: rankFamily === 'aqi' && rankGap === 'horizon',
      boundOrder: i.constraints !== undefined && invertedFamilies(i.constraints).some((f) => !unanswered.has(f)),
      modelDomain: source === 'archive' ? null : modelOutsideDomain(selected, i.points ?? []),
    },
    freezeGaps,
    unanswered,
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
 * Order is fixed rather than incidental: the vetoes about the work come first,
 * because they are about work already done or already sized (the refused run,
 * the ring, the count and the spend, then the window's own problems); the
 * settings the reader made that contradict each other second; and the
 * missing-input line last, because it is the one that says the app has
 * nothing to do at all.
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
  | 'refusal'
  | 'area'
  | 'over-cap'
  | 'spend'
  | 'window'
  | 'dates'
  | 'compare-aqi'
  | 'compare-freeze'
  | 'archive-cloud'
  | 'archive-freeze'
  | 'aqi-horizon'
  | 'model-domain'
  | 'bound-order'
  | 'destinations'
  | 'polygon'
  | 'types'

export function analyzeBlockers(g: AnalyzeGate & { drawPointCount: number }): AnalyzeBlocker[] {
  // Mid-analysis the button is disabled because it is busy, which the button
  // says itself. Nothing here is a reason the reader can act on.
  if (g.loading) return []
  const blockers: AnalyzeBlocker[] = []
  // The refused run leads: it is the one line about a press the reader just
  // made. An over-cap line says the same thing with the count as it stands
  // now, so it speaks in the refusal's place rather than beside it.
  if (g.refused && g.overCap === null) blockers.push('refusal')
  // How big the search is and what it would cost, both known before a run.
  if (g.areaTooLarge) blockers.push('area')
  if (g.overCap !== null) blockers.push('over-cap')
  if (g.spend !== null) blockers.push('spend')
  if (g.hasWindowWarning) blockers.push('window')
  if (g.datesPending) blockers.push('dates')
  // With the vetoes about work already done, and before the missing-input
  // lines: a contradiction between the models picked and the metric ranked is
  // a setting the reader made, not an input they have yet to give. So are a
  // ranking or a bound the window cannot answer, a model that does not reach
  // the area, and a bound that contradicts itself, in that order: the window
  // and the model before the bound, because a bound is the last setting made
  // and the cheapest to change.
  if (g.compareAqi) blockers.push('compare-aqi')
  if (g.compareFreeze) blockers.push('compare-freeze')
  if (g.archiveCloud) blockers.push('archive-cloud')
  if (g.archiveFreeze) blockers.push('archive-freeze')
  if (g.aqiHorizon) blockers.push('aqi-horizon')
  if (g.modelDomain !== null) blockers.push('model-domain')
  if (g.boundOrder) blockers.push('bound-order')
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
 * What a link that asked for its analysis to run on open (`analyze=1`, #511)
 * does now: wait, run, or drop the request unspent.
 *
 * A link the sender made on purpose is a request, which is the one thing that
 * may cross the spend boundary without a click. It still crosses it only the
 * way a click would: through the same gate the button reads, so an oversized
 * polygon, an unservable window or a compare veto stops it here and the panel's
 * blocker lines say why, exactly as they would for a reader who clicked.
 *
 * It waits for the live capabilities, because the restored window, model and
 * results cap are clamped against them and a run against the fallbacks could
 * buy a report the deployment would not have allowed. Then it is decided once
 * (#803, M3): the gate open at that moment runs the link, and a gate shut at
 * that moment drops the request. It used to stay armed for the session and
 * spend on the first edit that opened the gate, which could be the first day
 * clicked before a range was picked, or the third point of a redrawn ring: a
 * request the link made, spent on a panel the link never described.
 *
 * Whatever the gate learns after capabilities settle comes too late for this.
 * The ring's count before Analyze is fetched once they have, so a link whose
 * ring finds more than the cap can still run once and be refused by the pod,
 * and that refusal is a blocker of its own (record 0233).
 *
 * `fired` makes it once per page load: the gate closes while the analysis runs
 * and opens again when it ends, and without it that reopening would run the
 * link a second time. A dropped request is spent the same way.
 */
export interface AutoAnalyzeState {
  requested: boolean
  capabilitiesSettled: boolean
  gateOpen: boolean
  fired: boolean
}

export type AutoAnalyzeStep = 'wait' | 'run' | 'drop'

export function autoAnalyzeStep(s: AutoAnalyzeState): AutoAnalyzeStep {
  if (!s.requested || s.fired || !s.capabilitiesSettled) return 'wait'
  return s.gateOpen ? 'run' : 'drop'
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

/**
 * Whether the last refused run still holds Analyze (#803): a refusal stands
 * while the panel describes the request that was refused. It is a blocker
 * rather than the old dismissable line, because the same request is refused
 * the same way, and a button that stayed live sent it again on every press.
 *
 * Stricter than `retryStands`, which only relabels a button that runs: a
 * refusal holds the button shut, so every change that makes the request a
 * different one must lift it, or the reader is held with no way out. The
 * commit cues' comparison catches the model, the window, the ring, the
 * types and a destination added; two more catch what the cues pass over,
 * because a report can still answer them and a refused request cannot. A
 * cleared ring is a different request (the cues stay silent without one),
 * and so is a shorter list (the cues count additions only), which is the
 * remedy for a list too long.
 */
export function refusalStands(refusal: Refusal | null, failed: AnalyzedView | null, panel: RefusalPanel): boolean {
  if (refusal === null || failed === null) return false
  const { polygonKey } = discoveryKeys(panel.polygon, panel.destinationTypes, panel.includeUnnamedPeaks)
  if (polygonKey !== failed.polygonKey || panel.customCount !== failed.customKeys.size) return false
  return panelCommitCues(failed, { ...panel, settled: true }).length === 0
}

/** What the button reads, from whether a run is up and whether a retry stands. */
export function actionWord(loading: boolean, retry: boolean): ActionWord {
  if (loading) return 'Analyzing…'
  return retry ? 'Try again' : 'Analyze'
}
