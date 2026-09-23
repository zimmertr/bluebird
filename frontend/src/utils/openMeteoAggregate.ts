// The forecast arithmetic, and nothing else: one location's hourly payload in,
// the aggregates and the series a row ranks on out. A deliberate PORT of
// `backend/app/services/aggregation.py`, line for line and in the same order.
// `weather_vectors.json` pins the two to identical outputs, and
// `openMeteoAggregate.test.ts` reads both files and fails when their names or
// their order drift apart. Change the semantics there first, regenerate the
// vectors, and mirror the change here.
//
// A module of its own so the two halves of that contract can be read side by
// side. The fetch, the pacing and the cache stay in `openMeteo.ts`, which calls
// in here once per location.

import { BAD_BODY_MESSAGE, OpenMeteoBadBody } from './openMeteoErrors'

// ── Parity primitives ──────────────────────────────────────────────────────

// Python's round() is round-half-even; Math.round is round-half-up. Scaling by
// 10**digits and breaking the tie on the scaled value is the obvious port and it
// is wrong: the multiply rounds to the nearest double and can MANUFACTURE a tie
// the true value never had. 20.15 is really 20.1499999999999985789, which Python
// rounds down to 20.1, but 20.15 * 10 rounds up to exactly 201.5, which a
// tie-break then sends to 20.2. Measured before this was fixed: the two
// implementations disagreed on 4.0% of realistic temperature averages and 3.3%
// of precipitation averages, because a real API returns decimal-clean values and
// those are precisely the ones that land on manufactured ties.
//
// So: scale for the fast path, but when the scaled value lands exactly on .5,
// confirm the tie against the double's own decimal expansion before breaking it.
export function roundHalfEven(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v
  const factor = 10 ** digits
  const shifted = v * factor
  const floor = Math.floor(shifted)
  const diff = shifted - floor
  if (diff > 0.5) return (floor + 1) / factor
  if (diff < 0.5) return floor / factor
  return tieBreak(v, floor, digits) / factor
}

/**
 * Decide a scaled-value tie from the true decimal expansion of `v`.
 *
 * A double's exact decimal expansion terminates, and `toFixed` renders it
 * correctly rounded, so 25 places past the rounding position separates a real
 * tie (a "5" followed only by zeros) from a value that merely scaled into one.
 * Doubles at the magnitudes this app aggregates are spaced far wider than
 * 1e-25, so nothing but a genuine tie can present as one at that depth.
 *
 * The comparison runs on the magnitude and the direction is applied after,
 * because "round away from zero" is `floor` for a negative and `floor + 1` for
 * a positive.
 */
function tieBreak(v: number, floor: number, digits: number): number {
  const expansion = Math.abs(v).toFixed(Math.min(digits + 25, 100))
  const tail = expansion.slice(expansion.indexOf('.') + 1 + digits)
  const lead = tail.charCodeAt(0)
  // 53 is '5'. Above it the true value clears the halfway point; below it the
  // value never reached it; equal-and-then-nonzero clears it too.
  const cmp = lead > 53 ? 1 : lead < 53 ? -1 : /[1-9]/.test(tail.slice(1)) ? 1 : 0
  if (cmp > 0) return v < 0 ? floor : floor + 1
  if (cmp < 0) return v < 0 ? floor + 1 : floor
  return floor % 2 === 0 ? floor : floor + 1
}

// A stamp arrives in one of two shapes, and both are UTC.
//
// Every request here sends `timeformat=unixtime`, so the wire carries whole
// seconds: 1789430400 rather than "2026-09-15T00:00". That is 11 bytes instead
// of 18, and a multiply instead of a regex and a `Date.parse`. Measured
// 2026-09-14 over 540,000 stamps, which is a maximal 1,500-destination
// analysis of a 15-day window: 63 ms of parsing became 4 ms, and the response
// lost 11% of its raw bytes (2.9% after gzip, because repeated ISO text
// compresses well).
//
// The string arm stays, and is not legacy. `weather_vectors.json` is written
// by the backend's reference implementation and carries ISO stamps, so the
// vectors that pin this port to Python feed strings through this function.
// Open-Meteo returns naive-UTC "YYYY-MM-DDTHH:MM" there, and a bare
// `new Date(...)` would read it as LOCAL time, so the stamp is re-zoned before
// parsing — the exact counterpart of the backend's parse-then-treat-as-UTC
// (`_parse_ts` + `_epoch_ms`).
export function parseTs(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s * 1000 : null
  if (typeof s !== 'string') return null
  const zoned = /(?:[Zz]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`
  const t = Date.parse(zoned)
  return Number.isNaN(t) ? null : t
}

export function at<T>(arr: readonly T[], i: number): T | null {
  return i < arr.length ? (arr[i] ?? null) : null
}

export function roundOrNull(v: number | null, digits: number): number | null {
  return v == null ? null : roundHalfEven(v, digits)
}

// ── Pure transforms (vector-pinned ports) ──────────────────────────────────

export interface WeatherAggregates {
  precip_total_in: number
  precip_avg_in_hr: number
  precip_min_in_hr: number
  precip_max_in_hr: number
  temp_min_f: number
  temp_max_f: number
  temp_avg_f: number
  wind_min_mph: number
  wind_max_mph: number
  wind_avg_mph: number
  // Nullable where every other aggregate is not: five of the eight models
  // publish no freezing level at all (issue #295), and a row from one of them
  // still carries a full set of the numbers above.
  freeze_min_ft: number | null
  freeze_max_ft: number | null
  freeze_avg_ft: number | null
}

export interface WeatherSeries {
  times: number[]
  precip_in: (number | null)[]
  temp_f: (number | null)[]
  wind_mph: (number | null)[]
  freeze_ft: (number | null)[]
  /**
   * Wind bearing per hour, for the map's playback arrows (#121).
   *
   * Optional and client-populated, the same shape `series_times` takes on
   * `DestinationResult`: the backend does not fetch direction, so a report that
   * came back through the SSE fallback carries none and the arrows simply do
   * not appear on that path. Filled by the fetch rather than by `weatherSeries`
   * below, which is pinned byte-for-byte against the backend by
   * `weather_vectors.json` and must keep producing exactly what Python does.
   */
  wind_dir_deg?: (number | null)[]
}

export interface HourlyPayload {
  /**
   * The terrain elevation Open-Meteo resolved for the coordinate, in meters —
   * its ~90 m downscaling DEM, sent back on every forecast response. The
   * forecast grid reads it as each sample's own height (#288 review): a
   * lattice point has no destination elevation, but it stands on real ground.
   */
  elevation?: number
  /**
   * The unit Open-Meteo quoted each hourly variable in. Read in two places.
   * When two half-windows are joined (`joinHours`), the two hosts are sent the
   * same unit parameters, so a disagreement means one of them answered in
   * something else. And the freezing level's unit follows `precipitation_unit`,
   * so the value is feet under the `inch` every request here sends and meters
   * without it (port of `aggregation._freeze_unit`).
   */
  hourly_units?: Record<string, string>
  hourly?: {
    time?: unknown[]
    precipitation?: (number | null)[]
    temperature_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    wind_direction_10m?: (number | null)[]
    freezing_level_height?: (number | null)[]
    wind_speed_925hPa?: (number | null)[]
    wind_speed_850hPa?: (number | null)[]
    wind_speed_700hPa?: (number | null)[]
    wind_speed_600hPa?: (number | null)[]
    wind_speed_500hPa?: (number | null)[]
    temperature_925hPa?: (number | null)[]
    temperature_850hPa?: (number | null)[]
    temperature_700hPa?: (number | null)[]
    temperature_600hPa?: (number | null)[]
    temperature_500hPa?: (number | null)[]
    us_aqi?: (number | null)[]
  }
}

// Port of aggregation._WIND_LEVELS: the five free-air winds each hour also
// carries, and the ISA standard-atmosphere height of each level. The wind the
// table ranks on is wind at the destination's OWN elevation (issue #257) —
// `windAtElevation` interpolates between the two bracketing levels, floored
// at the friction-slowed 10 m value. Fixed heights rather than fetched
// geopotentials, for the reason aggregation.py records.
const WIND_LEVELS = [
  ['wind_speed_925hPa', 762],
  ['wind_speed_850hPa', 1457],
  ['wind_speed_700hPa', 3012],
  ['wind_speed_600hPa', 4206],
  ['wind_speed_500hPa', 5574],
] as const
// Port of aggregation._TEMP_LEVELS: the same five levels and the same ISA heights,
// read for the free-air TEMPERATURE each hour also carries (issue #443).
// `temperature_2m` is the model's 2 m reading over its cell's mean terrain,
// lapsed by Open-Meteo to the coordinate's 90 m DEM height (#457, measured
// 2026-09-22 within 12 to 155 m of four Cascade summits) — so it stands at the
// destination's elevation but carries the surface layer of a ground that under
// a summit is a valley floor radiating away on a clear night, which is how the
// table reported a summit below freezing while its own freezing level sat
// thousands of feet higher. `tempAtElevation` reads the free air instead.
//
// A separate table from WIND_LEVELS rather than one list of heights: the two
// interpolations differ in the one place that matters (the wind is floored at
// its 10 m value, the temperature is not), and a shared table would suggest
// they are the same rule.
const TEMP_LEVELS = [
  ['temperature_925hPa', 762],
  ['temperature_850hPa', 1457],
  ['temperature_700hPa', 3012],
  ['temperature_600hPa', 4206],
  ['temperature_500hPa', 5574],
] as const
export const FT_TO_M = 0.3048

// Port of aggregation._FREEZING_LEVEL: the height where the free-air temperature
// crosses freezing, clamped to 0 when the whole column is below freezing.
// Three of the eight models publish it (issue #295). Its unit follows
// `precipitation_unit`, so every request here gets FEET and a request without
// that parameter gets meters — read off the response, never assumed, because
// the factor between them is 3.28 and a freezing level 3.28 times too high is
// a plausible-looking altitude rather than an obvious fault.
const FREEZING_LEVEL = 'freezing_level_height'

// The hourly variables every weather request asks for. Spelled once because it
// is three things: what a request asks for, which arrays a joined half-window
// has to keep parallel (`joinHours`), and the count the weighted-call
// accounting is priced on — which is why the list is exported and why
// `mirroredConstants.test.ts` measures it against the backend's N_VARIABLES.
export const HOURLY_VARIABLES = [
  'precipitation',
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  FREEZING_LEVEL,
  ...WIND_LEVELS.map(([name]) => name),
  ...TEMP_LEVELS.map(([name]) => name),
] as const

// What the archive endpoint writes in `hourly_units` for a variable it does not
// serve. The column beside it is all nulls, so the unit carries no information.
const UNIT_UNSERVED = 'undefined'

// Port of aggregation._units_agree: no variable declared in two different real
// units. A unit is compared only where both hosts declare one; the archive
// answers "undefined" for the pressure-level winds it does not serve
// (measured 2026-09-13) where the forecast endpoint says "mp/h".
function unitsAgree(declared: readonly Record<string, string>[]): boolean {
  const keys = new Set(declared.flatMap((d) => Object.keys(d)))
  for (const key of keys) {
    const seen = new Set(
      declared.filter((d) => key in d && d[key] !== UNIT_UNSERVED).map((d) => d[key]),
    )
    if (seen.size > 1) return false
  }
  return true
}

/**
 * One location's half-windows as a single hourly payload.
 *
 * The aggregation below is pinned byte-for-byte against the backend by the
 * shared vectors, so a spanning window is made to look like every other window
 * BEFORE it reaches `weatherMetrics`: the halves are concatenated in time order
 * (the spans are disjoint and ordered, so appending them IS time order) and each
 * array is padded to the stamp count, which keeps them parallel for the
 * index-addressed reads the aggregation does.
 *
 * Two payloads are dropped rather than mixed. Disagreeing `hourly_units` means
 * one host answered in units the other did not, and a total of inches and
 * millimetres is a number with no meaning; a repeated stamp would count one hour
 * twice. Both degrade to no metrics for that location, which is what every
 * payload this module cannot read does. A unit is compared only where both
 * hosts declare one (`unitsAgree`).
 *
 * Mirror of `_join_hours` in `backend/app/services/aggregation.py`.
 */
// Port of aggregation._join_units: the joined payload's `hourly_units`, each
// variable's SERVED unit. The halves agree wherever both serve a variable
// (`unitsAgree`), so the only choice is between a real unit and the archive's
// "undefined", and the real one wins: the freezing level's reader converts by
// the declared unit, and a joined window that kept the archive's "undefined"
// over the forecast half's "ft" would refuse the very numbers it carries.
function joinUnits(declared: readonly Record<string, string>[]): Record<string, string> {
  const joined: Record<string, string> = {}
  for (const units of declared) {
    for (const [key, unit] of Object.entries(units)) {
      if ((joined[key] ?? UNIT_UNSERVED) === UNIT_UNSERVED) joined[key] = unit
    }
  }
  return joined
}

export function joinHours(parts: readonly HourlyPayload[]): HourlyPayload {
  if (parts.length === 1) return parts[0]
  const declared = parts.map((p) => p?.hourly_units ?? {})
  if (!unitsAgree(declared)) return {}
  const joined: Record<string, unknown[]> = { time: [] }
  for (const name of HOURLY_VARIABLES) joined[name] = []
  const seen = new Set<unknown>()
  for (const part of parts) {
    const hourly = (part?.hourly ?? {}) as Record<string, unknown[] | undefined>
    const times = hourly.time ?? []
    for (let i = 0; i < times.length; i++) {
      if (seen.has(times[i])) continue
      seen.add(times[i])
      joined.time.push(times[i])
      for (const name of HOURLY_VARIABLES) {
        joined[name].push(at(hourly[name] ?? [], i))
      }
    }
  }
  return {
    ...parts[0],
    hourly_units: joinUnits(declared),
    hourly: joined as NonNullable<HourlyPayload['hourly']>,
  }
}

// Port of aggregation._wind_at_elevation — line-for-line, because it feeds the
// vector-pinned aggregates. Every gap degrades to the 10 m wind: no
// elevation, an elevation under the lowest level (a valley destination IS
// sheltered), or a null at a needed level.
export function windAtElevation(
  w10: number,
  elevationFt: number | null | undefined,
  levels: readonly (number | null)[],
): number {
  if (elevationFt == null) return w10
  const elevM = elevationFt * FT_TO_M
  if (elevM <= WIND_LEVELS[0][1]) return w10
  let free: number | null = null
  if (elevM >= WIND_LEVELS[WIND_LEVELS.length - 1][1]) {
    free = levels[levels.length - 1] ?? null
  } else {
    for (let k = 0; k < WIND_LEVELS.length - 1; k++) {
      const hiH = WIND_LEVELS[k + 1][1]
      if (elevM < hiH) {
        const loH = WIND_LEVELS[k][1]
        const loV = levels[k]
        const hiV = levels[k + 1]
        if (loV != null && hiV != null) {
          free = loV + (hiV - loV) * ((elevM - loH) / (hiH - loH))
        }
        break
      }
    }
  }
  if (free == null) return w10
  return Math.max(w10, free)
}

// Port of aggregation._temp_at_elevation — line-for-line, because it feeds the
// vector-pinned aggregates. Every gap degrades to `temperature_2m`: no
// elevation, an elevation under the lowest level (a valley destination IS its
// own surface layer), a null at a needed level, or an archive window, whose
// levels come back null.
//
// Unlike `windAtElevation` there is no floor. A summit can be colder than the
// free air on a calm clear night and warmer than it under an inversion, so
// clamping in either direction would report a number no model produced.
export function tempAtElevation(
  t2m: number,
  elevationFt: number | null | undefined,
  levels: readonly (number | null)[],
): number {
  if (elevationFt == null) return t2m
  const elevM = elevationFt * FT_TO_M
  if (elevM <= TEMP_LEVELS[0][1]) return t2m
  let free: number | null = null
  if (elevM >= TEMP_LEVELS[TEMP_LEVELS.length - 1][1]) {
    free = levels[levels.length - 1] ?? null
  } else {
    for (let k = 0; k < TEMP_LEVELS.length - 1; k++) {
      const hiH = TEMP_LEVELS[k + 1][1]
      if (elevM < hiH) {
        const loH = TEMP_LEVELS[k][1]
        const loV = levels[k]
        const hiV = levels[k + 1]
        if (loV != null && hiV != null) {
          free = loV + (hiV - loV) * ((elevM - loH) / (hiH - loH))
        }
        break
      }
    }
  }
  if (free == null) return t2m
  return free
}

function levelArrays(hourly: NonNullable<HourlyPayload['hourly']>): (number | null)[][] {
  return WIND_LEVELS.map(([name]) => hourly[name] ?? [])
}

function tempLevelArrays(hourly: NonNullable<HourlyPayload['hourly']>): (number | null)[][] {
  return TEMP_LEVELS.map(([name]) => hourly[name] ?? [])
}

// Port of aggregation._freeze_unit.
function freezeUnit(payload: HourlyPayload): string | null {
  return payload?.hourly_units?.[FREEZING_LEVEL] ?? null
}

// Port of aggregation._freeze_to_ft: one reading in feet, per the unit the
// response declared. A unit that is neither documented one leaves the number
// unreadable, and assuming either would ship a reading 3.28 times out, so an
// unknown or missing unit fails the batch the way any unusable body does.
function freezeToFeet(v: number, unit: string | null): number {
  if (unit === 'ft') return v
  if (unit === 'm') return v / FT_TO_M
  throw new OpenMeteoBadBody(BAD_BODY_MESSAGE)
}

// Port of aggregation._freeze_ft_in_window: every in-window hour that HAS a
// freezing level, in feet. Read against its own pair of arrays rather than
// inside the metrics loop below, because an hour dropped for a null freezing
// level would take that hour's precipitation, temperature and wind with it —
// and five of the eight models answer a column of nulls.
function freezeFtInWindow(
  hourly: NonNullable<HourlyPayload['hourly']>,
  startMs: number,
  endMs: number,
  unit: string | null,
): number[] {
  const times = hourly.time ?? []
  const freeze = hourly[FREEZING_LEVEL] ?? []
  const out: number[] = []
  const n = Math.min(times.length, freeze.length)
  for (let i = 0; i < n; i++) {
    const v = freeze[i]
    if (v == null) continue
    const t = parseTs(times[i])
    if (t === null || t < startMs || t > endMs) continue
    out.push(freezeToFeet(v, unit))
  }
  return out
}

// Port of aggregation._weather_metrics: an hour missing ANY metric is dropped entirely,
// and the loop stops at the shortest array (Python zip semantics) — unlike
// the series below, which is times-driven. Malformed payloads degrade to
// null; only an unreadable freezing level unit throws.
export function weatherMetrics(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
  elevationFt: number | null = null,
): WeatherAggregates | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []
    const levels = levelArrays(hourly)
    const tLevels = tempLevelArrays(hourly)

    // min over the four core arrays keeps the pre-#257 hour-dropping
    // semantics: a missing or short LEVEL array can never drop an hour, only
    // send its wind back to the 10 m value and its temperature back to the
    // 2 m value.
    const n = Math.min(times.length, precip.length, temp.length, wind.length)
    const rows: Array<[number, number, number]> = []
    for (let i = 0; i < n; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      const p = precip[i]
      const tf = temp[i]
      const w = wind[i]
      if (p == null || tf == null || w == null) continue
      const wAdj = windAtElevation(w, elevationFt, levels.map((arr) => at(arr, i)))
      const tAdj = tempAtElevation(tf, elevationFt, tLevels.map((arr) => at(arr, i)))
      rows.push([p, tAdj, wAdj])
    }
    if (rows.length === 0) return null
    const fVals = freezeFtInWindow(hourly, startMs, endMs, freezeUnit(payload))

    // Left-to-right sums in input order, matching Python's sum() exactly.
    let pSum = 0
    let tSum = 0
    let wSum = 0
    let pMin = Infinity
    let pMax = -Infinity
    let tMin = Infinity
    let tMax = -Infinity
    let wMin = Infinity
    let wMax = -Infinity
    for (const [p, tf, w] of rows) {
      pSum += p
      tSum += tf
      wSum += w
      if (p < pMin) pMin = p
      if (p > pMax) pMax = p
      if (tf < tMin) tMin = tf
      if (tf > tMax) tMax = tf
      if (w < wMin) wMin = w
      if (w > wMax) wMax = w
    }
    // Its own left-to-right pass, for the same reason Python reduces it in a
    // separate comprehension: the hours it reduces are not the hours above.
    let fSum = 0
    let fMin = Infinity
    let fMax = -Infinity
    for (const f of fVals) {
      fSum += f
      if (f < fMin) fMin = f
      if (f > fMax) fMax = f
    }

    const len = rows.length
    return {
      precip_total_in: roundHalfEven(pSum, 4),
      precip_avg_in_hr: roundHalfEven(pSum / len, 4),
      // Near-zero for any window with one dry hour, and kept anyway: every
      // aggregate column is rankable (#291), so the set stays complete.
      precip_min_in_hr: roundHalfEven(pMin, 4),
      precip_max_in_hr: roundHalfEven(pMax, 4),
      temp_min_f: roundHalfEven(tMin, 1),
      temp_max_f: roundHalfEven(tMax, 1),
      temp_avg_f: roundHalfEven(tSum / len, 1),
      wind_min_mph: roundHalfEven(wMin, 1),
      wind_max_mph: roundHalfEven(wMax, 1),
      wind_avg_mph: roundHalfEven(wSum / len, 1),
      // Whole feet: the models resolve this to hundreds of meters, so a
      // decimal would be precision the number does not carry.
      freeze_min_ft: fVals.length === 0 ? null : roundHalfEven(fMin, 0),
      freeze_max_ft: fVals.length === 0 ? null : roundHalfEven(fMax, 0),
      freeze_avg_ft: fVals.length === 0 ? null : roundHalfEven(fSum / fVals.length, 0),
    }
  } catch (e) {
    // A unit nothing can read is not one bad hour to skip past: every number
    // in the column would have to be invented, so it passes the degrade and
    // fails the analysis. Mirrors the `except UpstreamError: raise` the
    // backend's `_metrics` puts ahead of its own degrade.
    if (e instanceof OpenMeteoBadBody) throw e
    return null
  }
}

// Port of aggregation._weather_series: times-driven (every in-window hour survives),
// with metric arrays padded by null when shorter — NOT zip semantics. The
// asymmetry with weatherMetrics is the backend's, preserved on purpose.
export function weatherSeries(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
  elevationFt: number | null = null,
): WeatherSeries | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []
    const freeze = hourly[FREEZING_LEVEL] ?? []
    const fUnit = freezeUnit(payload)
    const levels = levelArrays(hourly)
    const tLevels = tempLevelArrays(hourly)

    const grid: number[] = []
    const pOut: (number | null)[] = []
    const tOut: (number | null)[] = []
    const wOut: (number | null)[] = []
    const fOut: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      grid.push(t)
      pOut.push(roundOrNull(at(precip, i), 4))
      const t2m = at(temp, i)
      const tAdj =
        t2m == null ? null : tempAtElevation(t2m, elevationFt, tLevels.map((arr) => at(arr, i)))
      tOut.push(roundOrNull(tAdj, 1))
      const w10 = at(wind, i)
      const wAdj =
        w10 == null
          ? null
          : windAtElevation(w10, elevationFt, levels.map((arr) => at(arr, i)))
      wOut.push(roundOrNull(wAdj, 1))
      const fRaw = at(freeze, i)
      fOut.push(roundOrNull(fRaw === null ? null : freezeToFeet(fRaw, fUnit), 0))
    }
    if (grid.length === 0) return null
    return { times: grid, precip_in: pOut, temp_f: tOut, wind_mph: wOut, freeze_ft: fOut }
  } catch (e) {
    // The one failure this function does not absorb, for the reason
    // `weatherMetrics` does not absorb it either.
    if (e instanceof OpenMeteoBadBody) throw e
    return null
  }
}

export interface AqiAggregates {
  aqi_avg: number
  aqi_min: number
  aqi_max: number
}

export interface AqiSeries {
  times: number[]
  aqi: (number | null)[]
}

// Port of aggregation._aqi_metrics. US AQI is an integer index by definition —
// and Python's integer round() is still half-even (80.5 → 80), which
// Math.round would get wrong.
export function aqiMetrics(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): AqiAggregates | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const aqi = hourly.us_aqi ?? []

    const n = Math.min(times.length, aqi.length)
    const vals: number[] = []
    for (let i = 0; i < n; i++) {
      const v = aqi[i]
      if (v == null) continue
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      vals.push(v)
    }
    if (vals.length === 0) return null
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const v of vals) {
      sum += v
      if (v < min) min = v
      if (v > max) max = v
    }
    return {
      aqi_avg: roundHalfEven(sum / vals.length, 0),
      aqi_min: roundHalfEven(min, 0),
      aqi_max: roundHalfEven(max, 0),
    }
  } catch {
    return null
  }
}

// Port of aggregation._aqi_series: times-driven with null padding, like the
// weather series.
export function aqiSeries(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): AqiSeries | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const aqi = hourly.us_aqi ?? []

    const grid: number[] = []
    const out: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      grid.push(t)
      const v = at(aqi, i)
      out.push(v == null ? null : roundHalfEven(v, 0))
    }
    if (grid.length === 0) return null
    return { times: grid, aqi: out }
  } catch {
    return null
  }
}
