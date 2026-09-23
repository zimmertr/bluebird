// The forecast bounds, as one value: the shape the panel edits, the table of
// which result field each bound compares, and the filter `present.ts` runs
// over the held field. Apart from the analysis pipeline because none of it
// fetches anything: every bound re-reads rows already in hand, which is what
// makes each one a live knob rather than another Analyze.

import type { AnalyzeRequest, DestinationResult } from '../types'

/**
 * The forecast bounds an analysis is narrowed by, mirroring the ten optional
 * fields on `AnalyzeRequest`.
 *
 * Elevation is deliberately NOT in here, and the app sends no elevation bound
 * at all. It is the one bound known before any forecast exists, so it gates
 * what gets fetched and widening it needs a new analysis; the API still
 * accepts it for direct callers. Nothing in this shape can gate a fetch — a
 * destination's precipitation is unknowable until it has been fetched — which
 * is exactly what makes every one of these live.
 */
export interface Constraints {
  minPrecipTotalIn: number | null
  maxPrecipTotalIn: number | null
  minTempF: number | null
  maxTempF: number | null
  minWindMph: number | null
  maxWindMph: number | null
  minFreezeFt: number | null
  maxFreezeFt: number | null
  minSnowDepthIn: number | null
  maxSnowDepthIn: number | null
  minAqi: number | null
  maxAqi: number | null
}

export const NO_CONSTRAINTS: Constraints = {
  minPrecipTotalIn: null,
  maxPrecipTotalIn: null,
  minTempF: null,
  maxTempF: null,
  minWindMph: null,
  maxWindMph: null,
  minFreezeFt: null,
  maxFreezeFt: null,
  minSnowDepthIn: null,
  maxSnowDepthIn: null,
  minAqi: null,
  maxAqi: null,
}

// Which result field each bound compares — the port of _LOWER_BOUNDS and
// _UPPER_BOUNDS in analyze.py, and the whole of the design.
//
// A ceiling reads the window's worst hour and a floor its best, so a bound is
// a promise about every hour rather than about an average that can hide a bad
// afternoon: a 20 mph ceiling admits no destination that gusts to 45 at noon.
// The freezing level reads the same way, in the one family where neither end
// is the bad one: its floor asks that the level never dropped below the value
// and its ceiling that it never rose above it.
// Precipitation and AQI have no minimum aggregate to read — a per-hour
// precipitation floor would be 0.000 almost everywhere — so both of their
// bounds compare one field, and the panel labels those two rows with the table
// column they compare so the screen says which. Snow depth's two ends also
// read one field, and for a third reason: it is today's single number rather
// than a reduction over hours, so there is no best or worst hour to choose.
const LOWER_BOUNDS = [
  ['minPrecipTotalIn', 'precip_total_in'],
  ['minTempF', 'temp_min_f'],
  ['minWindMph', 'wind_min_mph'],
  ['minFreezeFt', 'freeze_min_ft'],
  ['minSnowDepthIn', 'snow_depth_in'],
  ['minAqi', 'aqi_max'],
] as const satisfies readonly (readonly [keyof Constraints, keyof DestinationResult])[]

const UPPER_BOUNDS = [
  ['maxPrecipTotalIn', 'precip_total_in'],
  ['maxTempF', 'temp_max_f'],
  ['maxWindMph', 'wind_max_mph'],
  ['maxFreezeFt', 'freeze_max_ft'],
  ['maxSnowDepthIn', 'snow_depth_in'],
  ['maxAqi', 'aqi_max'],
] as const satisfies readonly (readonly [keyof Constraints, keyof DestinationResult])[]

/** Is any bound set? Decides whether the count line mentions matching at all. */
export function hasConstraints(c: Constraints): boolean {
  return Object.values(c).some((v) => v !== null)
}

/** The bounds a request carries, as the panel and `present.ts` name them. */
export function constraintsFromRequest(request: AnalyzeRequest): Constraints {
  return {
    minPrecipTotalIn: request.min_precip_total_in ?? null,
    maxPrecipTotalIn: request.max_precip_total_in ?? null,
    minTempF: request.min_temp_f ?? null,
    maxTempF: request.max_temp_f ?? null,
    minWindMph: request.min_wind_mph ?? null,
    maxWindMph: request.max_wind_mph ?? null,
    minFreezeFt: request.min_freeze_ft ?? null,
    maxFreezeFt: request.max_freeze_ft ?? null,
    minSnowDepthIn: request.min_snow_depth_in ?? null,
    maxSnowDepthIn: request.max_snow_depth_in ?? null,
    minAqi: request.min_aqi ?? null,
    maxAqi: request.max_aqi ?? null,
  }
}

/** The bounds as the wire fields `AnalyzeRequest` names them. */
export function constraintFields(c: Constraints) {
  return {
    min_precip_total_in: c.minPrecipTotalIn,
    max_precip_total_in: c.maxPrecipTotalIn,
    min_temp_f: c.minTempF,
    max_temp_f: c.maxTempF,
    min_wind_mph: c.minWindMph,
    max_wind_mph: c.maxWindMph,
    min_freeze_ft: c.minFreezeFt,
    max_freeze_ft: c.maxFreezeFt,
    min_snow_depth_in: c.minSnowDepthIn,
    max_snow_depth_in: c.maxSnowDepthIn,
    min_aqi: c.minAqi,
    max_aqi: c.maxAqi,
  }
}

/**
 * Port of _filter_constraints: drop rows outside the forecast bounds.
 *
 * A null value passes every bound. Three fields can be null here, and no
 * absence is evidence of anything. A missing AQI means the window outran the
 * ~5-day air-quality horizon or a best-effort fetch failed; a missing freezing
 * level means the chosen model publishes none at all, which is five of the
 * eight, so dropping those rows would empty the table outright for anyone who
 * set the bound under the wrong model; a missing snow depth means the
 * destination is outside the grid, or the pod holds no grid yet. It is the
 * same call `rankComparator` makes for a nullable ranking key.
 */
export function filterConstraints(
  rows: readonly DestinationResult[],
  c: Constraints,
): readonly DestinationResult[] {
  const lower = LOWER_BOUNDS.filter(([k]) => c[k] !== null)
  const upper = UPPER_BOUNDS.filter(([k]) => c[k] !== null)
  if (lower.length === 0 && upper.length === 0) return rows
  return rows.filter((r) => {
    for (const [k, field] of lower) {
      const v = r[field] as number | null
      if (v != null && v < (c[k] as number)) return false
    }
    for (const [k, field] of upper) {
      const v = r[field] as number | null
      if (v != null && v > (c[k] as number)) return false
    }
    return true
  })
}
