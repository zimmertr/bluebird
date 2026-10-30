import { type ForecastSelection, selectionLocalWindow } from './calendar/calendarSelection'
import type { WindowLimits } from './forecastWindow'
import { roundTo } from './numbers'
import { aqiSpan, callWeight, fetchSpans } from './openMeteo'
import { CLOUD_VARIABLES, HOURLY_VARIABLES } from './openMeteoAggregate'

// What one analysis costs in Open-Meteo weighted calls, priced before it runs
// (#803, D2). The visitor's own address pays for every forecast the browser
// fetches, and the free tier allows 5,000 weighted calls an hour from it
// (published as `limits.open_meteo_hourly_calls`), so an analysis that costs
// more cannot finish inside the hour however it is paced: it spends the
// visitor's quota for the hour and then fails on the hourly 429. Priced in
// weighted calls and never in requests (#180).

/** The window an analysis fetches over, and what decides its hours. */
export interface SpendWindow {
  startMs: number
  endMs: number
  nowMs: number
  // Each the fetch's own fallback when not given, as the fetch reads it.
  windowLimits?: WindowLimits
  aqiForecastDays?: number
}

/** What an analysis fetches, as far as its price goes. */
export interface SpendInputs extends SpendWindow {
  /** How many destinations the ranking model forecasts. */
  destinations: number
  /** How many models the chart compares beside the ranking one. */
  comparedModels: number
  /** How many rows a compared model is fetched for: the displayed ones. */
  compareRows: number
}

/**
 * Weighted calls by Open-Meteo host. Each host meters its own budget: record
 * 0203 measured the minute bucket per host (with `api.open-meteo.com` refusing
 * at 600, the air-quality and archive hosts both still answered), and records
 * 0004 and 0203 rest on that. How the HOUR is counted is unmeasured; it is
 * taken to be per host like the minute, so an analysis is held when any one
 * host would pass the hourly budget, not when their sum would. If the hour
 * proves to be one count per address, the veto reads `totalCalls` instead.
 */
export interface HostCalls {
  /** `api.open-meteo.com`: the forecast spans' weather and cloud column, and the compared models' weather. */
  forecast: number
  /** `archive-api.open-meteo.com`: the archive spans' weather and cloud column. */
  archive: number
  /** `air-quality-api.open-meteo.com`: air quality. */
  airQuality: number
}

export const NO_CALLS: HostCalls = { forecast: 0, archive: 0, airQuality: 0 }

/** Two prices together, the second taken `times` times. */
export function addCalls(a: HostCalls, b: HostCalls, times = 1): HostCalls {
  return {
    forecast: a.forecast + times * b.forecast,
    archive: a.archive + times * b.archive,
    airQuality: a.airQuality + times * b.airQuality,
  }
}

/** Every host's calls in one number, for the day it proves the hour is one count. */
export function totalCalls(c: HostCalls): number {
  return c.forecast + c.archive + c.airQuality
}

/**
 * One model's weather for `n` destinations, and its cloud column with it when
 * `cloud` is set, each priced per span and booked to the span's host: a window
 * crossing the archive boundary is two requests per batch (`fetchSpans`), one
 * to each host, as `fetchWeather` and `fetchCloud` send them.
 */
export function modelCalls(n: number, w: SpendWindow, cloud: boolean): HostCalls {
  if (n <= 0) return NO_CALLS
  return fetchSpans(w.startMs, w.endMs, w.nowMs, w.windowLimits).reduce((sum, span) => {
    const calls =
      callWeight(n, span.startMs, span.endMs, HOURLY_VARIABLES.length, 1) +
      (cloud ? callWeight(n, span.startMs, span.endMs, CLOUD_VARIABLES.length, 1) : 0)
    return addCalls(sum, span.archive ? { ...NO_CALLS, archive: calls } : { ...NO_CALLS, forecast: calls })
  }, NO_CALLS)
}

/** Air quality for `n` destinations, over the hours `fetchAqi` asks for (`aqiSpan`). */
export function airCalls(n: number, w: SpendWindow): HostCalls {
  if (n <= 0) return NO_CALLS
  const span = aqiSpan(w.startMs, w.endMs, w.nowMs, w.aqiForecastDays)
  return span === null ? NO_CALLS : { ...NO_CALLS, airQuality: callWeight(n, w.startMs, span.reqEndMs, 1) }
}

/**
 * The weighted calls an analysis spends on each host, priced the way the
 * browser fetches it, batch for batch:
 *
 * - the ranking model's weather (`HOURLY_VARIABLES`) and cloud column
 *   (`CLOUD_VARIABLES`) for every destination, each priced per span on the
 *   span's host, as `fetchWeather` and `fetchCloud` book them;
 * - air quality once, over the hours `fetchAqi` asks for (`aqiSpan`), and
 *   nothing for a window wholly past the horizon;
 * - each compared model's weather for the displayed rows, which is what
 *   `useModelCompare` fetches: no cloud column and no air quality, which
 *   come from the ranking model's fetch alone. Priced over the whole window,
 *   where the fetch stops at the model's own reach (`compareEndMs`), so a
 *   short model is priced a little high.
 *
 * `callWeight` is linear in its location count, so pricing the whole field at
 * once is the sum of its batches of 50. The pod's `planned_weights`
 * (`services/weather.py`) prices its own plan the same way, weather and cloud
 * per span per batch, and differs on purpose in two places: it leaves air
 * quality out, because the pod fetches air quality lazily and on a budget of
 * its own, and it has no comparison, which the browser alone draws.
 */
export function analysisCalls(i: SpendInputs): HostCalls {
  return addCalls(
    addCalls(modelCalls(i.destinations, i, true), airCalls(i.destinations, i)),
    modelCalls(Math.min(i.compareRows, i.destinations), i, false),
    i.comparedModels,
  )
}

/**
 * The spend veto's numbers when any host's calls are past the hourly budget,
 * or null when every host fits. `needed` is the dearest host's total, rounded
 * up to a whole call, because the line quotes it and a fraction of a call is
 * not a thing the reader can spend.
 */
export function spendOver(calls: HostCalls, limit: number): { needed: number; limit: number } | null {
  // Rounded to a millionth of a call first: 1.6 is not exact in binary, so
  // 3 x 1.6 + 3.2 sums to a hair over 14 and would quote 15, or refuse an
  // analysis that costs the budget exactly.
  const dearest = roundTo(Math.max(calls.forecast, calls.archive, calls.airQuality), 6)
  return dearest > limit ? { needed: Math.ceil(dearest), limit } : null
}

/** What the Analyze gate's spend veto reads off the panel. */
export interface SpendVetoInputs {
  selection: ForecastSelection
  /**
   * How many destinations the analysis is known to cover before it runs: the
   * ring's count ahead of Analyze plus the pasted list and the pins, or the
   * list alone with no ring. Null while the ring's count is unknown.
   */
  known: number | null
  /** The published analysis cap: a count over it is the cap's to refuse. */
  maxDestinations: number
  comparedModels: number
  limit: number
  hourlyCalls: number
  windowLimits: WindowLimits
  aqiForecastDays: number
  now: Date
}

/**
 * The gate's spend veto from the panel (#803, D2): the known count priced
 * over the selected window, host by host, against the published hourly
 * budget.
 *
 * Off with no count, with no window, and over the cap: a field over the cap
 * is refused by the over-cap line in its own words, and its spend would be a
 * second red line about an analysis that cannot run anyway.
 *
 * The run prices itself again once its field is known (`runClientAnalysis`),
 * on the rows it really fetches, so a deployment with no count ahead of
 * Analyze still refuses before it spends. The two can differ for a
 * re-analysis that reuses held forecasts: this one prices the whole field,
 * because which rows a run may reuse is decided at the press.
 */
export function spendVeto(i: SpendVetoInputs): { needed: number; limit: number } | null {
  if (i.known === null || i.known === 0 || i.known > i.maxDestinations) return null
  const window = selectionLocalWindow(i.selection, i.now)
  if (window === null) return null
  const calls = analysisCalls({
    destinations: i.known,
    startMs: new Date(window.start).getTime(),
    endMs: new Date(window.end).getTime(),
    nowMs: i.now.getTime(),
    windowLimits: i.windowLimits,
    aqiForecastDays: i.aqiForecastDays,
    comparedModels: i.comparedModels,
    compareRows: i.limit,
  })
  return spendOver(calls, i.hourlyCalls)
}
