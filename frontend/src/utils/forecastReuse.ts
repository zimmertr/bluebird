import type { DestinationResult } from '../types'
import type { HeldColumns } from './clientAnalyze'

// Whether a field the browser already holds may stand in for a fresh fetch,
// and what to hold once a run finishes. Pure so the one rule that spends or
// saves a visitor's Open-Meteo quota is testable without rendering the hook
// that asks it.

// How long a held forecast may stand in for a fresh one. Mirrors the per-
// location forecast TTL in backend/app/services/cache.py: past it the server
// would refetch rather than serve its copy, so reusing here would hand the
// visitor numbers their own pod has already retired.
export const FORECAST_REUSE_MS = 15 * 60 * 1000

/** The forecasts the last analysis fetched, and the question they answer. */
export interface HeldForecasts {
  rows: DestinationResult[]
  times: number[]
  startMs: number
  endMs: number
  model: string
  // When the FIRST of these rows was fetched, not the last run that reused
  // them.
  fetchedAtMs: number
  // The rows, by `geoKey`, whose air quality FAILED rather than answered
  // null. A reuse asks those again (#580); absent means none did.
  aqiFailed?: ReadonlySet<string>
  // The raw Open-Meteo columns behind the rows, by `geoKey`, whose elevation
  // no lookup has answered yet, so a run that reuses the row can reduce it
  // at the height its own lookup returns (#673). Absent means none.
  columns?: ReadonlyMap<string, HeldColumns>
}

/** The window and model a run asks for, after the window is resolved. */
export interface ForecastQuestion {
  startMs: number
  endMs: number
  model: string
}

/**
 * The held field, when it answers the same question recently enough, or null.
 *
 * The window compared is the RESOLVED pair: "now" floors to its containing
 * hour, so two analyses in one hour ask the same thing.
 */
export function reusableForecasts(
  held: HeldForecasts | null,
  asked: ForecastQuestion,
  nowMs: number,
): HeldForecasts | null {
  if (held === null) return null
  const same = held.startMs === asked.startMs && held.endMs === asked.endMs && held.model === asked.model
  return same && nowMs - held.fetchedAtMs < FORECAST_REUSE_MS ? held : null
}

/**
 * What to hold after a run. A run that reused a field keeps that field's clock,
 * so a field cannot be kept alive indefinitely by re-analyzing every fourteen
 * minutes.
 */
export function holdForecasts(
  reused: HeldForecasts | null,
  rows: DestinationResult[],
  times: number[],
  asked: ForecastQuestion,
  nowMs: number,
  aqiFailed: ReadonlySet<string>,
  columns: ReadonlyMap<string, HeldColumns>,
): HeldForecasts {
  return { rows, times, ...asked, fetchedAtMs: reused?.fetchedAtMs ?? nowMs, aqiFailed, columns }
}
