// How the held universe becomes the rows on screen (#188).
//
// The Analyze button is a spend boundary, not ceremony (#177). A knob that
// needs new upstream data keeps its explicit commit; a knob that only re-reads
// data the browser already holds applies live. Since #187 the browser holds
// the whole ranked field before the `limit` cut, so sort, limit and every
// forecast bound are pure re-presentation. This module is that derivation,
// extracted from App.tsx so it can be tested directly rather than through
// component wiring.
//
// It is deliberately the only place that answers "which rows are displayed",
// so the map markers, the results table, the header copy, and the "showing N
// of M" count cannot drift from each other.

import { DestinationResult, SortBy } from '../types'
import type { AnalyzedView } from '../hooks/analyzeTypes'
import { Constraints, filterConstraints, rankComparator } from './clientAnalyze'
import { namesOnRequestMetric } from './constraints'
import { compareAdded } from './modelCompare'
import { geoKey } from './points'
import { isPointSample } from './forecastWindow'
import type { SelectionKind } from './calendarSelection'

/**
 * The knobs that decide presentation rather than what gets fetched.
 *
 * Recorded on each analysis as well as read live, so the two can be compared:
 * that comparison is the whole of `commitNeeded` below.
 */
export interface PresentationKnobs {
  sortBy: SortBy
  sortDesc: boolean
  limit: number
  /**
   * The forecast bounds. They need no narrowing predicate: every one of them
   * can only re-read rows already in hand, so loosening one is as live as
   * tightening it. No knob here gates a fetch, which is what makes the whole
   * derivation answerable from the held field.
   */
  constraints: Constraints
}

/**
 * The knobs an analysis was run under, for comparison against the live ones.
 *
 * Nothing beyond the presentation knobs: no knob the panel offers decides
 * what gets fetched, so a snapshot never has to be compared value by value.
 */
export type AnalyzedSnapshot = PresentationKnobs

export type CommitReason =
  | 'window-changed'
  | 'model-changed'
  | 'polygon-changed'
  | 'types-changed'
  | 'destination-added'
  | 'cloud-needed'

/**
 * The change flags `commitNeeded` cannot compute from the knobs it holds: each
 * is a comparison against something the caller records about the last analysis
 * (its window, its model, its discovery inputs, its custom set). An object
 * rather than positional booleans, because five `false`s in a row is how a
 * caller swaps two of them without the compiler noticing.
 */
export interface CommitChanges {
  window: boolean
  model: boolean
  polygon: boolean
  types: boolean
  destinationAdded: boolean
  /**
   * The ranking or a bound names a cloud metric and the report was analyzed
   * without the cloud column (#117). `cloudNeeded` below is the one spelling
   * of that comparison.
   */
  cloud: boolean
}

/**
 * Has a live knob asked for data the report does not hold (#117)?
 *
 * The cloud column is the one piece of a report fetched only on request, so
 * choosing a cloud ranking or typing a cloud bound over a report without it is
 * the one way a PRESENTATION knob can stop being live. Read against the
 * snapshot rather than the rows: a report whose rows all carry null cloud
 * fields may still have fetched them (every hour in the archive, say), and
 * asking for an Analyze there would buy the same nulls again.
 */
export function cloudNeeded(
  analyzed: { cloudFetched: boolean } | null,
  namesCloud: boolean,
): boolean {
  return analyzed !== null && !analyzed.cloudFetched && namesCloud
}

/**
 * The identity of an analysis's discovery inputs: which ring was searched, and
 * for which kinds. One builder for both sides of the comparison — recorded off
 * the request when an analysis commits, and derived from the panel afterwards —
 * so the two can never disagree on spelling. The unnamed-peaks toggle joins
 * the types key because it widens what discovery finds the same way checking
 * another type does.
 */
export function discoveryKeys(
  polygon: { coordinates: number[][][] } | null | undefined,
  types: readonly string[] | undefined,
  includeUnnamed: boolean | undefined,
): DiscoveryKeys {
  return {
    polygonKey: JSON.stringify(polygon?.coordinates ?? null),
    // Sorted so checking peaks then lakes and lakes then peaks are one
    // discovery, matching the order-independent cache key upstream.
    typesKey: `${[...(types ?? [])].sort().join(',')}${includeUnnamed ? '|unnamed' : ''}`,
  }
}

export interface DiscoveryKeys {
  polygonKey: string
  typesKey: string
}

/**
 * Which discovery inputs the panel has moved since the analysis: the ring, the
 * kinds, or both.
 *
 * The two are INDEPENDENT. Suppressing the types cue when the ring also moved
 * was tried and is wrong: a user who redrew the polygon *and* checked another
 * kind changed two things and is owed two sentences, and collapsing them
 * silently dropped the one they had just clicked (TJ, 2026-08-22).
 *
 * Both need a complete ring (`hasRing`), for the same reason from two sides:
 * mid-draw the polygon blocker is already speaking, a cleared ring leaves
 * nothing to re-search, and a type set with no ring discovers nothing — so a
 * report with no polygon at all can never go stale this way.
 *
 * Pure and here rather than inline in `App.tsx`, because Vitest runs in a bare
 * node environment: logic left in the component is untestable by construction,
 * which is exactly how the suppression above shipped uncaught.
 */
export function discoveryChanges(
  analyzed: DiscoveryKeys | null,
  panel: DiscoveryKeys,
  hasRing: boolean,
): { polygon: boolean; types: boolean } {
  if (analyzed === null || !hasRing) return { polygon: false, types: false }
  return {
    polygon: panel.polygonKey !== analyzed.polygonKey,
    types: panel.typesKey !== analyzed.typesKey,
  }
}

/**
 * Every reason the displayed report cannot be re-derived from what the
 * browser holds, or an empty array when it can and the knobs are therefore
 * live.
 *
 * Replaces `rankingStale`, which flagged any sort change. Once sort is live
 * that cue is not merely redundant, it is wrong: it would ask for an Analyze
 * that changes nothing. What survives is the honest inverse — the cue appears
 * exactly where a knob has stopped being live, so a user is never left
 * wondering why the table went quiet.
 *
 * Every reason is a CHANGE the caller reports rather than a comparison made
 * here, which is why the live knobs are not a parameter. The snapshot is still
 * taken because a null one means nothing has committed yet:
 *
 * - `'model-changed'`: a different weather model is behind the panel than behind
 *   the rows. Always a commit, and for a stronger reason than the window: the
 *   held field is not merely missing rows, every number in it came from a model
 *   the panel no longer names.
 * - `'window-changed'`: the forecast selection is not the one behind the rows.
 *   Always a commit — the browser holds no forecasts for days it never fetched —
 *   and worth naming since the calendar made changing it a click (#166), where
 *   typing two datetimes was hard to do by accident.
 * - `'polygon-changed'`: a complete polygon is drawn and it is not the ring
 *   the report's discovery searched — including when that report searched no
 *   ring at all. Silent while no complete polygon exists: mid-draw the
 *   polygon blocker already speaks, and a cleared ring leaves nothing to
 *   re-search.
 * - `'types-changed'`: the checked types (or the unnamed-peaks toggle) are
 *   not the ones discovery ran with. Independent of the polygon cue — a
 *   changed ring AND changed types are two sentences, not one (TJ,
 *   2026-08-22) — and, like it, silent while no complete polygon exists,
 *   because types without a ring discover nothing.
 * - `'destination-added'`: the panel names a custom destination the analysis
 *   never covered (`pendingDestinations` is the caller's predicate — the same
 *   one behind the map's pending dots, so the cue and the dots cannot
 *   disagree).
 * - `'cloud-needed'`: the ranking or a bound names a cloud metric the report
 *   was analyzed without (#117). The only reason a presentation knob raises,
 *   and last for that reason: every cue above names a data input that moved,
 *   and any of those Analyzes fetches the cloud column too, so when one of
 *   them shows this line is the smaller half of the same click.
 *
 * ALL that apply, not the first (TJ, 2026-08-22): a user who changed both the
 * window and the model is owed both sentences, and the notice box bullets
 * them. The order is fixed, model first: a model change can clamp the window
 * as a side effect (`clampSelection`), and when both lines show, leading with
 * the model keeps the clamp attributed to its cause.
 */
export function commitNeeded(
  analyzed: AnalyzedSnapshot | null,
  changed: CommitChanges,
): CommitReason[] {
  // Nothing on screen yet, so nothing to be out of date with. Since #240
  // removed the server SSE fallback, a committed report always holds its full
  // field, so there is no path where a sort or a limit stops being live.
  if (analyzed === null) return []
  const reasons: CommitReason[] = []
  if (changed.model) reasons.push('model-changed')
  if (changed.window) reasons.push('window-changed')
  if (changed.polygon) reasons.push('polygon-changed')
  if (changed.types) reasons.push('types-changed')
  if (changed.destinationAdded) reasons.push('destination-added')
  if (changed.cloud) reasons.push('cloud-needed')
  return reasons
}

/** The panel as `panelCommitCues` compares it against the report. */
export interface PanelState {
  /** False while a run is in flight or before any report: no cue speaks then. */
  settled: boolean
  selectionKind: AnalyzedView['kind']
  windowMs: { startMs: number; endMs: number }
  forecastModel: string
  comparedModels: readonly string[]
  polygon: { coordinates: number[][][] } | null
  destinationTypes: readonly string[]
  includeUnnamedPeaks: boolean
  /** How many named destinations no analysis has covered (`pendingDestinations`). */
  pendingCount: number
  sortBy: SortBy
  constraints: Constraints
}

/**
 * Every commit cue the panel shows, read off the panel and the report.
 *
 * `commitNeeded` above decides the order and the wording's reasons; this is
 * which panel state feeds each one, so that choice is testable too rather
 * than left inline in `App.tsx`.
 */
export function panelCommitCues(analyzed: AnalyzedView | null, panel: PanelState): CommitReason[] {
  // Mid-run the report is about to change, and before any report there is
  // nothing to be out of date with.
  if (!panel.settled || analyzed === null) return []
  // The forecast window is a data knob: the browser holds no forecasts for
  // days it never fetched, so a calendar change cannot re-present anything.
  // The current hour is exempt, since its window moves with the clock and a
  // cue that never cleared would ask for an Analyze whose answer is already
  // on screen. Switching between the two arms still counts.
  const window =
    analyzed.kind !== panel.selectionKind ||
    (panel.selectionKind === 'days' &&
      (analyzed.window.startMs !== panel.windowMs.startMs ||
        analyzed.window.endMs !== panel.windowMs.endMs))
  // A model change is a data knob for a stronger reason than the window: every
  // number in the held rows came from a model the panel no longer names. A
  // newly ticked comparison is the same disagreement, since the browser holds
  // no forecasts for a model it never bought. Unticking one is not: its line
  // is drawn from numbers already in hand, so it stops at once.
  const model =
    analyzed.forecastModel !== panel.forecastModel ||
    compareAdded(analyzed.compareModels, panel.comparedModels)
  const discovery = discoveryChanges(
    analyzed,
    discoveryKeys(panel.polygon, panel.destinationTypes, panel.includeUnnamedPeaks),
    panel.polygon !== null,
  )
  return commitNeeded(analyzed, {
    window,
    model,
    polygon: discovery.polygon,
    types: discovery.types,
    // The same set behind the map's pending dots, so the cue and the dots
    // cannot disagree about what an analysis has not covered.
    destinationAdded: panel.pendingCount > 0,
    cloud: cloudNeeded(analyzed, namesOnRequestMetric(panel.sortBy, panel.constraints)),
  })
}

export interface Presentation {
  /** The rows to display, in display order. */
  rows: DestinationResult[]
  /**
   * How many destinations could appear in the table under the current forecast
   * bounds, before the `limit` cut and before removals. This is the "of M" in
   * "showing N of M destinations". Removals are excluded to match
   * `total_queried`, which has never counted them either.
   *
   * Counted from the held field rather than taken from `total_queried`, because
   * a bound applied live has to move it or the count describes a field the
   * table no longer shows. The two differ by however many candidates came back
   * with no usable forecast, which is the honest number here: a row without a
   * forecast can never be one of the N.
   */
  eligible: number
  /**
   * How many of the analyzed destinations the forecast bounds rejected.
   *
   * Reported separately rather than folded into `eligible` because they answer
   * different questions: `eligible` is how many rows the table could show, and
   * this is how much of the analysis is being hidden by a knob the user set. A
   * bound that quietly empties a report is the failure mode worth naming, so
   * the footer says "of 91 analyzed" exactly when this is non-zero.
   */
  excluded: number
}

/**
 * Derive the displayed rows from the held field and the live knobs.
 *
 * Order matters. The forecast bounds run first, and `eligible` is read between
 * them and the removals so the count describes the area rather than the user's
 * edits. The `limit` cut runs last, after removals, so
 * removing a row promotes the next one in rather than leaving a gap — and,
 * because both filters precede it, "the ten driest destinations that stay
 * under 20 mph" is literally what comes back rather than "whichever of the ten
 * driest happened to be calm". That ordering is the same one analyze.py uses,
 * for the same reason.
 *
 * A null universe means no analysis has committed yet: since #240 removed the
 * server SSE fallback, there is no path that commits a response without also
 * holding its full field.
 */
export function presentResults(
  universe: readonly DestinationResult[] | null,
  knobs: PresentationKnobs,
  removedKeys: ReadonlySet<string>,
): Presentation {
  const kept = (rows: readonly DestinationResult[]) =>
    rows.filter((r) => !removedKeys.has(geoKey(r.latitude, r.longitude)))

  if (universe === null) {
    return { rows: [], eligible: 0, excluded: 0 }
  }

  const matching = filterConstraints(universe, knobs.constraints)
  const rows = kept(matching)
  rows.sort(rankComparator(knobs.sortBy, knobs.sortDesc))
  return {
    rows: rows.slice(0, knobs.limit),
    eligible: matching.length,
    excluded: universe.length - matching.length,
  }
}

/**
 * Does anything on screen carry a number for the ranked metric?
 *
 * The map's colour key answers "what do these colours mean", and a key over a
 * field that has no colours answers a question nobody asked. That case is real
 * for one metric: five of the eight forecast models publish no freezing level,
 * so a whole report can rank by it and every row read N/A. The markers are
 * already right — each wears the neutral no-value fill — and the key is the
 * only thing left asserting bands that nothing is drawn in.
 *
 * Read over the DISPLAYED rows rather than the held field, because the key
 * explains what is on the map. Live filters are what make those two different.
 *
 * Nothing to do with which metric it is: a report whose rows all lack AQI, or
 * one emptied by a bound, answers the same way. So there is no freezing-level
 * special case here, and a model that starts publishing the variable needs no
 * code change.
 */
export function fieldHasValue(
  rows: readonly DestinationResult[],
  sortBy: SortBy,
): boolean {
  return rows.some((row) => row[sortBy] != null)
}

/** What the displayed report is rendered under, and whether it is one hour. */
export interface ReportView {
  view: { sortBy: SortBy; sortDesc: boolean; kind: SelectionKind; window: { startMs: number; endMs: number } }
  pointSample: boolean
}

/**
 * What the displayed report is rendered under: markers, legend, results
 * header, and table column order all read from here.
 *
 * With a field held, the panel's ranking IS the displayed ranking: the rows
 * are re-derived from it on every change, so reading the snapshot's would show
 * a legend that disagreed with the table. The window stays the snapshot's
 * either way: it is a data knob, and a point sample cannot become a range
 * without a new analysis. Before the first analysis there is no field and
 * nothing to disagree with, so the panel's selection answers.
 *
 * `pointSample` says whether the report's aggregates are one value three
 * times, which collapses the table's columns and drops the aggregate from the
 * ranking's name. It is counted off the window rather than read off a mode
 * name, so "a day narrowed to one hour" is recognized as the point sample it
 * is (#166).
 */
export function reportView(
  analyzed: AnalyzedView | null,
  sortBy: SortBy,
  sortDesc: boolean,
  selectionKind: SelectionKind,
  panelWindowMs: { startMs: number; endMs: number },
): ReportView {
  const view =
    analyzed !== null
      ? { sortBy, sortDesc, kind: analyzed.kind, window: analyzed.window }
      : { sortBy, sortDesc, kind: selectionKind, window: panelWindowMs }
  return { view, pointSample: isPointSample(view.window.startMs, view.window.endMs) }
}
