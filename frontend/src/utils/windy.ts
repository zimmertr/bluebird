// Where a metric cell links to on Windy, and what it asks Windy to show.
//
// A cell used to link to a coordinate and a layer, which opened Windy on its
// own default model at its own default hour. Both are now sent, so the map the
// reader lands on is the one the number came from (TJ, 2026-09-14).
//
// Pure, and here rather than in the table, for the reason every derivation in
// this repository is: Vitest runs in the node environment, so logic left inside
// a component cannot be tested at all.
//
// **Windy's grammar, measured against the live site on 2026-09-14** rather than
// read off documentation, because none of this is documented:
//
// - The path segment is optional. `windy.com/?gfs,temp,LAT,LON,11` selects GFS
//   and Windy rewrites the URL to `/-Temperature-temp?...` itself.
// - The model token leads the query, before the layer.
// - The time token is `YYYY-MM-DD-HH` in **UTC**, and sits between the layer
//   and the latitude.
// - Windy SNAPS the hour to the model's own step. GFS asked for hour 13 came
//   back as 12, because it is three-hourly at that range.
// - A time outside the model's reach is clamped to the end of it, and a time in
//   the PAST is dropped entirely: the map opens at "now". Bluebird's calendar
//   reaches 55 days back, so that is a real case rather than an edge one, and
//   the maintainer accepted it rather than withholding the link.
// - A regional model asked for a place it does not cover falls back to ECMWF
//   and drops the token. That is what lets this file send a regional token
//   without carrying Windy's coverage polygons.

import { HourlySeries } from '../types'

/**
 * Bluebird's forecast model to Windy's, matched by the AGENCY behind it.
 *
 * Provider is the honest criterion: a reader who picked the Met Office should
 * land on the Met Office's model, not on whatever else is fine there. Every
 * token was read from Windy's own product registry on the live site
 * (`W.products`) rather than guessed, and each is checked against that
 * registry's `provider` field.
 *
 * Four of the eight are APPROXIMATE, and knowingly so. Bluebird's `gem`,
 * `ukmo`, `meteofrance` and `jma` are seamless blends of an agency's global
 * and regional models; Windy carries only the regional half of each. Inside
 * that half the two agree about whose model it is, which is the question the
 * link answers. Outside it Windy falls back to ECMWF on its own, which is the
 * same place the link went before this existed.
 *
 * `gfs_seamless` blends HRRR into GFS for its first two days, and maps to plain
 * `gfs`: one link cannot carry two models, and GFS is the one that covers the
 * whole window (TJ, 2026-09-14).
 */
const WINDY_MODEL: Readonly<Record<string, string>> = {
  ecmwf_ifs025: 'ecmwf',
  gfs_seamless: 'gfs',
  icon_seamless: 'icon',
  gem_seamless: 'canHrdps',
  ukmo_seamless: 'ukv',
  meteofrance_seamless: 'arome',
  jma_seamless: 'jmaMsm',
}

/**
 * HRRR is two domains on Windy and one model in Bluebird, so the destination
 * decides which one (TJ, 2026-09-14).
 *
 * A box rather than Windy's own polygon: the fallback above makes a wrong
 * answer cost nothing (Windy drops a token it cannot serve), so the box only
 * has to be right about which of the two to try first. It covers mainland
 * Alaska and the Aleutians either side of the antimeridian, which is the one
 * place a longitude test has to be written as two.
 */
function hrrrDomain(latitude: number, longitude: number): string {
  const alaska =
    latitude >= 50 && latitude <= 73 && (longitude <= -128 || longitude >= 170)
  return alaska ? 'hrrrAlaska' : 'hrrrConus'
}

export function windyModel(
  modelId: string | null | undefined,
  latitude: number,
  longitude: number,
): string | null {
  if (!modelId) return null
  if (modelId === 'gfs_hrrr') return hrrrDomain(latitude, longitude)
  return WINDY_MODEL[modelId] ?? null
}

/**
 * The hour Windy is asked to show, as its own token.
 *
 * UTC, because that is what Windy reads: the maintainer's own example put
 * 5 AM Pacific at hour 13. Built by hand rather than by slicing an ISO string,
 * since `toISOString` would need the same three substrings anyway and would
 * hide which field each one is.
 */
export function windyTime(epochMs: number): string {
  const at = new Date(epochMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}-${pad(at.getUTCHours())}`
}

/** Which hourly series a column's extreme reads, and which end of it. */
interface Extreme {
  field: keyof HourlySeries
  lowest: boolean
}

/**
 * The columns that name one hour, and which hour each one names.
 *
 * Only the floors and the ceilings are here. An average and a window total are
 * every hour at once, so there is no hour to send and those cells link as they
 * always did (TJ, 2026-09-14).
 *
 * The wind entries are the knowingly imperfect ones: Bluebird's wind is
 * interpolated to the destination's elevation and Windy draws the 10 m wind, so
 * the hour of one is not always the hour of the other. The maintainer chose to
 * link it anyway and to say so in the app instead (issue #361).
 */
// Snow depth names no hour at all, which is why it is absent from the table
// below rather than mapped to a series: it is one number for today, so its
// cell links to Windy's snow cover at the destination and lets Windy open at
// its own "now" (#449).
const EXTREME: Readonly<Record<string, Extreme>> = {
  temp_min_f: { field: 'temp_f', lowest: true },
  temp_max_f: { field: 'temp_f', lowest: false },
  wind_min_mph: { field: 'wind_mph', lowest: true },
  wind_max_mph: { field: 'wind_mph', lowest: false },
  precip_min_in_hr: { field: 'precip_in', lowest: true },
  precip_max_in_hr: { field: 'precip_in', lowest: false },
  freeze_min_ft: { field: 'freeze_ft', lowest: true },
  freeze_max_ft: { field: 'freeze_ft', lowest: false },
  aqi_min: { field: 'aqi', lowest: true },
  aqi_max: { field: 'aqi', lowest: false },
  cloud_base_min_ft: { field: 'cloud_base_ft', lowest: true },
  cloud_base_max_ft: { field: 'cloud_base_ft', lowest: false },
  cloud_cover_min_pct: { field: 'cloud_cover_pct', lowest: true },
  cloud_cover_max_pct: { field: 'cloud_cover_pct', lowest: false },
}

/**
 * Which hour of a row's series produced the number in one of its cells.
 *
 * The FIRST hour that reaches the extreme, so a flat run — a night of no rain,
 * a column of zeros — names its beginning rather than an arbitrary point
 * inside it. Nulls are skipped rather than counted as zero, which is the same
 * rule the aggregation itself follows.
 *
 * Returns null when the column names no single hour, when the row carries no
 * series, or when every hour of it is absent.
 */
export function extremeHourMs(
  columnKey: string,
  series: HourlySeries | null | undefined,
  times: readonly number[],
): number | null {
  const want = EXTREME[columnKey]
  if (!want || !series) return null
  const values = series[want.field]
  if (!Array.isArray(values)) return null

  let at = -1
  let best = 0
  for (let i = 0; i < values.length && i < times.length; i++) {
    const v = values[i]
    if (v == null) continue
    if (at === -1 || (want.lowest ? v < best : v > best)) {
      at = i
      best = v
    }
  }
  return at === -1 ? null : times[at]
}

/**
 * The link itself.
 *
 * Zoom 11 throughout, which is what the link has always used: close enough to
 * read one valley, wide enough that a coordinate rounded to four decimals lands
 * in the right place.
 */
export function windyUrl(options: {
  latitude: number
  longitude: number
  layer: string
  modelId?: string | null
  atMs?: number | null
}): string {
  const { latitude, longitude, layer, modelId, atMs } = options
  const model = windyModel(modelId, latitude, longitude)
  const parts = [
    ...(model ? [model] : []),
    layer,
    ...(atMs != null ? [windyTime(atMs)] : []),
    latitude.toFixed(4),
    longitude.toFixed(4),
    '11',
  ]
  return `https://www.windy.com/?${parts.join(',')}`
}
