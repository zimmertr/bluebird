// How the held universe becomes the rows on screen (#188).
//
// The Analyze button is a spend boundary, not ceremony (#177). A knob that
// needs new upstream data keeps its explicit commit; a knob that only re-reads
// data the browser already holds applies live. Since #187 the browser holds
// the whole ranked field before the `limit` cut, so sort, limit, and NARROWING
// the elevation band are all pure re-presentation. This module is that
// derivation, extracted from App.tsx so it can be tested directly rather than
// through component wiring — the same move #179 made for analyzeEvents.ts.
//
// It is deliberately the only place that answers "which rows are displayed",
// so the map markers, the results table, the header copy, and the "showing N
// of M" count cannot drift from each other.

import { AnalyzeResponse, DestinationResult, SortBy } from '../types'
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

/**
 * Why the displayed report cannot be re-derived from what the browser holds,
 * or `null` when it can and the knobs are therefore live.
 *
 * Replaces `rankingStale`, which flagged any sort change. Once sort is live
 * that cue is not merely redundant, it is wrong: it would ask for an Analyze
 * that changes nothing. What survives is the honest inverse — the cue appears
 * exactly where a knob has stopped being live, so a user is never left
 * wondering why the table went quiet:
 *
 * - `'server-path'`: the analysis came back over the SSE fallback, which sends
 *   only its trimmed rows, so there is no field to re-rank or re-cut. Every
 *   knob commits, as it did before #188. The overlay has already explained the
 *   fallback ("Weather service unreachable from this browser"), so this only
 *   has to name the consequence.
 * - `'elevation-widened'`: see `bandNarrows`, and `bandGated` for the reports
 *   this cannot apply to.
 * - `'window-changed'`: the forecast selection is not the one behind the rows.
 *   Always a commit — the browser holds no forecasts for days it never fetched —
 *   and worth naming since the calendar made changing it a click (#166), where
 *   typing two datetimes was hard to do by accident. Reported ahead of the other
 *   two: it names the knob the user just touched, which is the more useful
 *   sentence even when a band was widened in the same breath.
 * - `'model-changed'`: a different weather model is behind the panel than behind
 *   the rows. Always a commit, and for a stronger reason than the window: the
 *   held field is not merely missing rows, every number in it came from a model
 *   the panel no longer names. Reported first, because a model change can clamp
 *   the window as a side effect (`clampSelection`) and would otherwise report
 *   itself as the window change it caused.
 */
export function commitNeeded(
  analyzed: AnalyzedSnapshot | null,
  panel: PresentationKnobs,
  hasUniverse: boolean,
  windowChanged: boolean,
  modelChanged: boolean,
): 'server-path' | 'elevation-widened' | 'window-changed' | 'model-changed' | null {
  // Nothing on screen yet, so nothing to be out of date with.
  if (analyzed === null) return null
  if (modelChanged) return 'model-changed'
  if (windowChanged) return 'window-changed'
  if (!hasUniverse) {
    const same =
      analyzed.sortBy === panel.sortBy &&
      analyzed.sortDesc === panel.sortDesc &&
      analyzed.limit === panel.limit &&
      analyzed.band.min === panel.band.min &&
      analyzed.band.max === panel.band.max &&
      (Object.keys(panel.constraints) as (keyof Constraints)[]).every(
        (k) => analyzed.constraints[k] === panel.constraints[k],
      )
    return same ? null : 'server-path'
  }
  if (!analyzed.bandGated) return null
  return bandNarrows(analyzed.band, panel.band) ? null : 'elevation-widened'
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
 * With no universe (the SSE fallback) there is nothing to re-derive: the
 * server already ranked and cut, so its rows pass through with only removals
 * applied, exactly as before #188. Re-sorting them here would be the
 * approximation #187 removed, reintroduced one layer up — the ten driest
 * reordered by wind, presented as the ten least windy.
 */
export function presentResults(
  universe: readonly DestinationResult[] | null,
  response: AnalyzeResponse | null,
  knobs: PresentationKnobs,
  removedKeys: ReadonlySet<string>,
): Presentation {
  const kept = (rows: readonly DestinationResult[]) =>
    rows.filter((r) => !removedKeys.has(pinKey(r.latitude, r.longitude)))

  if (universe === null) {
    // No field to re-derive from, so both counts have to come off the wire.
    // The server applied the bounds itself there, which is why it reports the
    // matched count separately: the rows it sends are already past the cut and
    // cannot be counted back into a field.
    const queried = response?.total_queried ?? 0
    const matched = response?.total_matched ?? queried
    return {
      rows: kept(response?.results ?? []),
      eligible: matched,
      excluded: Math.max(0, queried - matched),
    }
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
