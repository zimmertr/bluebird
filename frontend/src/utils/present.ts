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
import { filterElevation, rankComparator } from './clientAnalyze'
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
 * - `'elevation-widened'`: see `bandNarrows`.
 * - `'window-changed'`: the forecast selection is not the one behind the rows.
 *   Always a commit — the browser holds no forecasts for days it never fetched —
 *   and worth naming since the calendar made changing it a click (#166), where
 *   typing two datetimes was hard to do by accident. Reported ahead of the other
 *   two: it names the knob the user just touched, which is the more useful
 *   sentence even when a band was widened in the same breath.
 */
export function commitNeeded(
  analyzed: PresentationKnobs | null,
  panel: PresentationKnobs,
  hasUniverse: boolean,
  windowChanged: boolean,
): 'server-path' | 'elevation-widened' | 'window-changed' | null {
  // Nothing on screen yet, so nothing to be out of date with.
  if (analyzed === null) return null
  if (windowChanged) return 'window-changed'
  if (!hasUniverse) {
    const same =
      analyzed.sortBy === panel.sortBy &&
      analyzed.sortDesc === panel.sortDesc &&
      analyzed.limit === panel.limit &&
      analyzed.band.min === panel.band.min &&
      analyzed.band.max === panel.band.max
    return same ? null : 'server-path'
  }
  return bandNarrows(analyzed.band, panel.band) ? null : 'elevation-widened'
}

export interface Presentation {
  /** The rows to display, in display order. */
  rows: DestinationResult[]
  /**
   * How many destinations could appear in the table under the current band,
   * before the `limit` cut and before removals. This is the "of M" in "showing
   * N of M destinations". Removals are excluded to match `total_queried`, which
   * has never counted them either.
   *
   * Counted from the held field rather than taken from `total_queried`, because
   * narrowing the band live has to move it or the count describes a field the
   * table no longer shows. The two differ by however many candidates came back
   * with no usable forecast, which is the honest number here: a row without a
   * forecast can never be one of the N.
   */
  eligible: number
}

/**
 * Derive the displayed rows from the held field and the live knobs.
 *
 * Order matters. The band filter runs first because it decides which
 * destinations are candidates at all, and `eligible` is read between it and
 * the removals so the count describes the area rather than the user's edits.
 * The `limit` cut runs last, after removals, so removing a row promotes the
 * next one in rather than leaving a gap.
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
    // No field to re-derive from, so the count has to come off the wire.
    return { rows: kept(response?.results ?? []), eligible: response?.total_queried ?? 0 }
  }

  const inBand = filterElevation(universe, knobs.band.min, knobs.band.max)
  const rows = kept(inBand)
  rows.sort(rankComparator(knobs.sortBy, knobs.sortDesc))
  return { rows: rows.slice(0, knobs.limit), eligible: inBand.length }
}
