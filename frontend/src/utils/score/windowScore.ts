/**
 * A row's score over the window: its hours scored on the lens, the best four
 * consecutive daylight hours of any one day, and the window score that ranks
 * it.
 *
 * Window score = 0.75 × the best four hours + 0.25 × the mean of every
 * daylight hour. The best run carries the weight because a day out is one
 * stretch of hours, not the whole window; the mean keeps a destination whose
 * one good morning sits in a wet week below one that is good all week.
 *
 * The dark hours are left out because nobody plans a summit by them. A window
 * with no daylight hour at all (a night sample) is scored on every hour
 * instead, so it still ranks.
 */
import type { DestinationResult } from '../../types'
import { HOUR_MS } from '../forecastWindow'
import { litHours, solarDay } from './daylight'
import { AIR_CURVE, COMFORT_CURVE, DRY_CURVE, WARMTH_CURVE, WIND_CURVE, freshFactor, ramp, skyFactor } from './factors'
import { hourScore } from './hourScore'
import { LENS_WEIGHTS, type Factor, type Lens } from './lenses'


/** How many consecutive hours make the best stretch of a day. */
export const BEST_RUN_HOURS = 4
export const BEST_RUN_WEIGHT = 0.75

export interface RowScore {
  // The window score, a whole number from 0 to 100, or null for a row with no
  // hour the forecast answered.
  score: number | null
  // The best stretch's first hour and the instant after its last, or null.
  bestStartMs: number | null
  bestEndMs: number | null
  // Every hour's score on the window's grid, unrounded, null where no factor
  // answered; and which of those hours are the ones the score read.
  hours: (number | null)[]
  lit: boolean[]
  // The best stretch as indexes on the grid, its first hour and the one past
  // its last, or null.
  best: [number, number] | null
}

function at<T>(arr: readonly T[] | null | undefined, i: number): T | null {
  return arr ? (arr[i] ?? null) : null
}

/** One hour's factors for a row, by index on its series. */
export function hourFactors(row: DestinationResult, i: number): Partial<Record<Factor, number | null>> {
  const s = row.series
  if (!s) return {}
  const temp = at(s.temp_f, i)
  const wind = at(s.wind_mph, i)
  const precip = at(s.precip_in, i)
  const aqi = at(s.aqi, i)
  return {
    sky: skyFactor(row.elevation_ft ?? row.terrain_ft ?? null, at(s.cloud_deck_ft, i), at(s.cloud_top_ft, i)),
    wind: wind == null ? null : ramp(WIND_CURVE, wind),
    comfort: temp == null ? null : ramp(COMFORT_CURVE, temp),
    warmth: temp == null ? null : ramp(WARMTH_CURVE, temp),
    dry: precip == null ? null : ramp(DRY_CURVE, precip),
    air: aqi == null ? null : ramp(AIR_CURVE, aqi),
    fresh: freshFactor(s.snowfall_in, i),
  }
}

/** The best run of up to `BEST_RUN_HOURS` consecutive scored hours in one day. */
function bestRun(
  times: readonly number[],
  hours: readonly (number | null)[],
  read: readonly boolean[],
  lonDeg: number,
): { mean: number; start: number; end: number } | null {
  // Maximal runs first: consecutive on the clock, all read, all scored, one day.
  const runs: [number, number][] = []
  let start = -1
  for (let i = 0; i <= times.length; i++) {
    const ok = i < times.length && read[i] && hours[i] != null
    const joins =
      ok &&
      start !== -1 &&
      times[i] - times[i - 1] === HOUR_MS &&
      solarDay(times[i], lonDeg) === solarDay(times[start], lonDeg)
    if (ok && start === -1) start = i
    else if (ok && !joins) {
      runs.push([start, i])
      start = i
    } else if (!ok && start !== -1) {
      runs.push([start, i])
      start = -1
    }
  }
  if (runs.length === 0) return null
  const longest = Math.max(...runs.map(([a, b]) => b - a))
  const size = Math.min(BEST_RUN_HOURS, longest)
  let best: { mean: number; start: number; end: number } | null = null
  for (const [a, b] of runs) {
    for (let k = a; k + size <= b; k++) {
      let sum = 0
      for (let j = k; j < k + size; j++) sum += hours[j] ?? 0
      const mean = sum / size
      if (best === null || mean > best.mean) best = { mean, start: k, end: k + size }
    }
  }
  return best
}

export function scoreRow(row: DestinationResult, times: readonly number[], lens: Lens): RowScore {
  const grid = row.series_times ?? times
  const weights = LENS_WEIGHTS[lens]
  const hours = grid.map((_, i) => hourScore(hourFactors(row, i), weights))
  const daylight = litHours(row.latitude, row.longitude, grid)
  const anyLit = daylight.some((d, i) => d && hours[i] != null)
  const lit = anyLit ? daylight : grid.map(() => true)

  const read = hours.filter((h, i): h is number => h != null && lit[i] === true)
  if (read.length === 0) return { score: null, bestStartMs: null, bestEndMs: null, hours, lit, best: null }
  const mean = read.reduce((a, b) => a + b, 0) / read.length
  const best = bestRun(grid, hours, lit, row.longitude)
  const bestMean = best?.mean ?? mean
  const score = Math.round(BEST_RUN_WEIGHT * bestMean + (1 - BEST_RUN_WEIGHT) * mean)
  return {
    score,
    bestStartMs: best ? grid[best.start] : null,
    bestEndMs: best ? grid[best.end - 1] + HOUR_MS : null,
    hours,
    lit,
    best: best ? [best.start, best.end] : null,
  }
}

/**
 * The field with each row's score, best stretch and their absence laid on it,
 * for `presentResults` to rank by. A new array of new rows, since a row is
 * shared with the held field and its score belongs to one lens.
 */
export function scoreRows(rows: readonly DestinationResult[], times: readonly number[], lens: Lens): DestinationResult[] {
  return rows.map((row) => {
    const { score, bestStartMs, bestEndMs, hours, lit, best } = scoreRow(row, times, lens)
    return {
      ...row,
      score,
      best_start_ms: bestStartMs,
      best_end_ms: bestEndMs,
      score_hours: hours,
      score_lit: lit,
      score_best: best,
    }
  })
}
