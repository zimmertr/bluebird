// The client-side twin of the backend's window normalization
// (models.py `window_within_servable_range`). Only the branches the SPA can
// reach are ported: the app always sends BOTH timestamps (point modes send
// start == end), so the forecast_mode inference for missing timestamps is
// server-only territory and deliberately not duplicated here.
//
// Parity notes: timestamps arrive as full ISO strings from Date.toISOString().
// Equal timestamps are a point sample — floored to the hour they land in and
// spanned by one minute, so the hourly filter catches exactly one stamp (a
// bare +1h span would catch two whenever the moment sits on an hour
// boundary). The horizon slack (95/17 days) matches the backend constants
// behind the advertised ~90-day / ~16-day limits, and the error strings are
// the server's own so a client-refused window reads identically to a
// server-refused one.

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export const PAST_LIMIT_SLACK_DAYS = 95
export const FUTURE_LIMIT_SLACK_DAYS = 17

// Naive strings are read as UTC, exactly like the backend's parsing. The SPA
// always sends zoned ISO, but the guard keeps hand-fed values honest.
function parseIso(s: string): number {
  const zoned = /(?:[Zz]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`
  const t = Date.parse(zoned)
  if (Number.isNaN(t)) throw new Error(`Unparseable datetime: ${s}`)
  return t
}

export interface ResolvedWindow {
  startMs: number
  endMs: number
}

/**
 * How many hourly stamps the analysis actually covered.
 *
 * This is the honest replacement for asking which "mode" an analysis was in.
 * The results table collapses its avg/min/max triplets when they would be the
 * same number three times, and what decides that is the number of hourly
 * stamps the backend's inclusive `start <= ts <= end` filter matched — not the
 * name of a picker. Two facts make the count non-obvious, and both are why this
 * is a function rather than a subtraction at the call site:
 *
 * - Equal timestamps are a point sample. The backend (and `resolveWindow`
 *   above) floors them to the hour and spans one minute, so the filter matches
 *   exactly one stamp rather than none.
 * - The filter is inclusive at both ends, so a 06:00-to-07:00 window matches
 *   two stamps, and 06:00-to-06:59 matches one. A whole local day ends at 23:59
 *   for that reason: midnight-to-midnight would match 25.
 *
 * Counted on UTC hour boundaries, which is where Open-Meteo's stamps land.
 */
export function hourlyStampCount(startMs: number, endMs: number): number {
  if (startMs === endMs) return 1
  const first = Math.ceil(startMs / HOUR_MS)
  const last = Math.floor(endMs / HOUR_MS)
  return Math.max(0, last - first + 1)
}

/** A window covering one hourly stamp, whose aggregates are all one value. */
export function isPointSample(startMs: number, endMs: number): boolean {
  return hourlyStampCount(startMs, endMs) === 1
}

/**
 * A point sample as a window a fetch can use.
 *
 * Equal timestamps are how "the current hour" is expressed, and they describe
 * no span at all: Open-Meteo's inclusive `start <= ts <= end` filter matches
 * nothing between a moment and itself. Flooring to the hour and spanning one
 * minute is what makes it match exactly the stamp meant. Any other window is
 * returned untouched.
 *
 * Split out of `resolveWindow` because the `analyzed` snapshot records the
 * request's raw timestamps rather than the resolved ones, so anything fetching
 * from that snapshot has to apply the same rule — the forecast grid (#246) is
 * the first thing to, and before this it asked for a zero-width window and got
 * an empty answer for every cell, silently.
 */
export function normalizeWindow(startMs: number, endMs: number): ResolvedWindow {
  if (startMs !== endMs) return { startMs, endMs }
  const floored = startMs - (startMs % HOUR_MS)
  return { startMs: floored, endMs: floored + MINUTE_MS }
}

export function resolveWindow(
  startIso: string,
  endIso: string,
  nowMs: number = Date.now(),
): ResolvedWindow {
  const { startMs, endMs } = normalizeWindow(parseIso(startIso), parseIso(endIso))

  if (startMs >= endMs) {
    throw new Error('The start date must be before the end date.')
  }
  if (startMs < nowMs - PAST_LIMIT_SLACK_DAYS * DAY_MS) {
    throw new Error(
      'start_datetime is beyond the ~90-day history limit of the weather API. ' +
        'Move the window start closer to today.',
    )
  }
  if (endMs > nowMs + FUTURE_LIMIT_SLACK_DAYS * DAY_MS) {
    throw new Error(
      'end_datetime is beyond the ~16-day forecast horizon of the weather API. ' +
        'Move the window end closer to today.',
    )
  }
  return { startMs, endMs }
}
