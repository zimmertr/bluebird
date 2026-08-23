// How the held universe becomes the rows on screen (#188).
//
// The Analyze button is a spend boundary, not ceremony (#177). A knob that
// needs new upstream data keeps its explicit commit; a knob that only re-reads
// data the browser already holds applies live. Since #187 the browser holds
// the whole ranked field before the `limit` cut, so sort, limit, and NARROWING
// the elevation band are all pure re-presentation. This module is that
// derivation, extracted from App.tsx so it can be tested directly rather than
// through component wiring.
//
// It is deliberately the only place that answers "which rows are displayed",
// so the map markers, the results table, the header copy, and the "showing N
// of M" count cannot drift from each other.

import { DestinationResult, SortBy } from '../types'
import { Constraints, filterConstraints, filterElevation, rankComparator } from './clientAnalyze'
import { pinKey } from './customList'

/** An elevation band. `null` on either end means unbounded, as in the API. */
export interface Band {
  min: number | null
  max: number | null
}

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
  band: Band
  /**
   * The forecast bounds. Unlike the band, these have no narrowing predicate and
   * need none: elevation gates the fetch, so widening it asks for destinations
   * the browser never fetched, while a precipitation ceiling can only ever
   * re-read rows already in hand. Loosening one is as live as tightening it.
   */
  constraints: Constraints
}

/**
 * The knobs an analysis was run under, plus the one fact about it that decides
 * whether a wider band can be answered from what came back.
 *
 * Elevation gates DISCOVERY, and only polygon discovery: a custom list is
 * resolved coordinate by coordinate and the band never touches it, so a
 * custom-only report holds every row it ever had and a widen re-presents it
 * for free. Without this the cue fired on exactly the reports that did not
 * need it, asking for an Analyze whose answer was already on screen — the same
 * false alarm `rankingStale` used to raise for sort.
 */
export interface AnalyzedSnapshot extends PresentationKnobs {
  bandGated: boolean
}

/**
 * Is `panel` a subset of `analyzed` — i.e. would every destination inside the
 * panel's band already be inside the analyzed one?
 *
 * This is what separates a live narrow from an Analyze-requiring widen. The
 * held field was discovered under `analyzed`, so a subset band is answerable
 * by filtering it and a wider one genuinely has rows we never fetched. `null`
 * is unbounded, so an absent analyzed edge admits any panel edge and an absent
 * panel edge is admitted only when the analyzed edge was absent too.
 */
export function bandNarrows(analyzed: Band, panel: Band): boolean {
  const minOk = analyzed.min === null || (panel.min !== null && panel.min >= analyzed.min)
  const maxOk = analyzed.max === null || (panel.max !== null && panel.max <= analyzed.max)
  return minOk && maxOk
}

export type CommitReason =
  | 'elevation-widened'
  | 'window-changed'
  | 'model-changed'
  | 'polygon-changed'
  | 'types-changed'
  | 'destination-added'

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
 * wondering why the table went quiet:
 *
 * - `'model-changed'`: a different weather model is behind the panel than behind
 *   the rows. Always a commit, and for a stronger reason than the window: the
 *   held field is not merely missing rows, every number in it came from a model
 *   the panel no longer names.
 * - `'window-changed'`: the forecast selection is not the one behind the rows.
 *   Always a commit — the browser holds no forecasts for days it never fetched —
 *   and worth naming since the calendar made changing it a click (#166), where
 *   typing two datetimes was hard to do by accident.
 * - `'elevation-widened'`: see `bandNarrows`, and `bandGated` for the reports
 *   this cannot apply to.
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
 *
 * ALL that apply, not the first (TJ, 2026-08-22): a user who changed both the
 * window and the model is owed both sentences, and the notice box bullets
 * them. The order is fixed, model first: a model change can clamp the window
 * as a side effect (`clampSelection`), and when both lines show, leading with
 * the model keeps the clamp attributed to its cause.
 */
export function commitNeeded(
  analyzed: AnalyzedSnapshot | null,
  panel: PresentationKnobs,
  changed: CommitChanges,
): CommitReason[] {
  // Nothing on screen yet, so nothing to be out of date with. Since #240
  // removed the server SSE fallback, a committed report always holds its full
  // field, so there is no path where a sort or a limit stops being live.
  if (analyzed === null) return []
  const reasons: CommitReason[] = []
  if (changed.model) reasons.push('model-changed')
  if (changed.window) reasons.push('window-changed')
  if (analyzed.bandGated && !bandNarrows(analyzed.band, panel.band)) {
    reasons.push('elevation-widened')
  }
  if (changed.polygon) reasons.push('polygon-changed')
  if (changed.types) reasons.push('types-changed')
  if (changed.destinationAdded) reasons.push('destination-added')
  return reasons
}

export interface Presentation {
  /** The rows to display, in display order. */
  rows: DestinationResult[]
  /**
   * How many destinations could appear in the table under the current band and
   * forecast bounds, before the `limit` cut and before removals. This is the
   * "of M" in "showing N of M destinations". Removals are excluded to match
   * `total_queried`, which has never counted them either.
   *
   * Counted from the held field rather than taken from `total_queried`, because
   * narrowing the band live has to move it or the count describes a field the
   * table no longer shows. The two differ by however many candidates came back
   * with no usable forecast, which is the honest number here: a row without a
   * forecast can never be one of the N.
   */
  eligible: number
  /**
   * How many destinations the band admitted but the forecast bounds rejected.
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
 * Order matters. The band filter runs first because it decides which
 * destinations are candidates at all, then the forecast bounds, and `eligible`
 * is read between those and the removals so the count describes the area
 * rather than the user's edits. The `limit` cut runs last, after removals, so
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
    rows.filter((r) => !removedKeys.has(pinKey(r.latitude, r.longitude)))

  if (universe === null) {
    return { rows: [], eligible: 0, excluded: 0 }
  }

  const inBand = filterElevation(universe, knobs.band.min, knobs.band.max)
  const matching = filterConstraints(inBand, knobs.constraints)
  const rows = kept(matching)
  rows.sort(rankComparator(knobs.sortBy, knobs.sortDesc))
  return {
    rows: rows.slice(0, knobs.limit),
    eligible: matching.length,
    excluded: inBand.length - matching.length,
  }
}
