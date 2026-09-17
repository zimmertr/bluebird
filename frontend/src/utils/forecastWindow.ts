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
// boundary). The horizon slack is the accept bound the backend validates
// against, taken from what `/api/capabilities` publishes rather than compiled
// here, and the error strings are the server's own so a client-refused window
// reads identically to a server-refused one.
//
// It also owns which Open-Meteo endpoint a window belongs to (`windowSource`,
// issue #123), because that is the same question one level down: a window the
// forecast endpoint has no data for is the archive's, and one that crosses
// between them belongs to both, fetched from each and joined at the seam.

// Exported rather than declared again in the two other modules that needed it
// (#388). It lives here because this is the file that turns a forecast window
// into hours; both readers are doing a piece of the same arithmetic.
export const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

// The three numbers below are FALLBACKS, not the values this module computes
// with. Each one is published — `limits.max_past_days`, `limits.max_future_days`
// and `limits.past_data_days` — and reaches the live path through
// `hooks/useCapabilities.ts` as a `WindowLimits` argument, so a server-side
// recalibration never needs a coordinated frontend release (#393; the pattern
// #152 set for the polygon cap). Nothing here reads one: they exist for the
// hook to hold until the fetch answers, and for `mirroredConstants.test.ts` to
// pin against the backend constants the server publishes them from, so the
// fallback and the published value agree by test rather than by luck.

// Mirror of `ARCHIVE_DATA_DAYS` + its slack and `FUTURE_LIMIT_SLACK_DAYS` in
// `backend/app/models.py`. The past bound follows the ARCHIVE's reach rather
// than the forecast endpoint's, because a window older than the forecast
// endpoint's own data is answered from the archive (see `windowSource`).
export const PAST_LIMIT_SLACK_DAYS = 375
export const FUTURE_LIMIT_SLACK_DAYS = 17

// Where the forecast endpoint's own data stops, and therefore the boundary
// between the two endpoints. Mirror of `PAST_DATA_DAYS` in
// `backend/app/models.py`, which carries the per-model measurements behind it:
// past roughly two months every model answers 200 with an hourly array of
// nulls, and this is one conservative floor for all of them.
export const PAST_DATA_DAYS = 55

// One local calendar day of tolerance on the forecast side of that boundary.
// The boundary is an instant and a calendar day is not: west of Greenwich a
// local day's last minute lands on the next UTC date, so a day the calendar
// draws can straddle the boundary by up to 14 hours. Without the tolerance that
// one day would be split across two datasets and joined at a seam 14 hours into
// it, although the forecast endpoint holds the whole of it. Mirror of
// `ARCHIVE_STRADDLE_DAYS` in `backend/app/models.py`.
export const ARCHIVE_STRADDLE_DAYS = 1

/**
 * The window bounds a deployment enforces, as one value.
 *
 * One object rather than three number parameters for the same reason
 * `BandLimits` in `calendar.ts` is one: they are the same type, of similar
 * magnitude, and would sit adjacent in an argument list, so a transposed pair
 * would compile and quietly move the archive seam or refuse a legal window.
 */
export interface WindowLimits {
  /** Days back `start_datetime` may reach. `limits.max_past_days`. */
  maxPastDays: number
  /** Days ahead `end_datetime` may reach. `limits.max_future_days`. */
  maxFutureDays: number
  /** Where the forecast endpoint's data stops. `limits.past_data_days`. */
  pastDataDays: number
}

/**
 * What a caller that passes no limits gets.
 *
 * Omitting them is not "any numbers will do": it is the pre-fetch state, the
 * same values `useCapabilities` holds until `/api/capabilities` answers. That
 * is the one behavior this default is allowed to have, which is what makes it
 * safe on the paths that genuinely have no capabilities to hand — the test
 * suite, and the moments before the first analysis.
 */
export const FALLBACK_WINDOW_LIMITS: WindowLimits = {
  maxPastDays: PAST_LIMIT_SLACK_DAYS,
  maxFutureDays: FUTURE_LIMIT_SLACK_DAYS,
  pastDataDays: PAST_DATA_DAYS,
}

/** Which endpoint answers a window: one of them, or both across a seam. */
export type WindowSource = 'forecast' | 'archive' | 'spanning'

/**
 * The instant the archive's hours end and the forecast endpoint's begin.
 *
 * `now - pastDataDays`, floored to the UTC day, because every fetch sends UTC
 * hour stamps. One definition for three readers: `windowSource` classifies a
 * window against it, `fetchWeather` splits a spanning window at it, and the
 * panel names the two days it falls between. A second spelling could put the
 * seam an hour from where the classification believed it was.
 *
 * Mirror of `archive_boundary` in `backend/app/models.py`.
 */
export function archiveBoundaryMs(
  nowMs: number = Date.now(),
  limits: WindowLimits = FALLBACK_WINDOW_LIMITS,
): number {
  return Math.floor((nowMs - limits.pastDataDays * DAY_MS) / DAY_MS) * DAY_MS
}

/**
 * Which Open-Meteo endpoint answers this window, or that both do.
 *
 * One boundary, defined once by `archiveBoundaryMs` above. A window entirely
 * older than it is the archive's; one starting at it — within a local day, see
 * ARCHIVE_STRADDLE_DAYS — is the forecast endpoint's; one that starts before it
 * and ends after it is both endpoints', fetched twice and joined at the seam
 * before the aggregation sees it.
 *
 * The archive test comes first so the one-day overlap the straddle tolerance
 * opens resolves to the archive, which holds every hour in it rather than
 * relying on the forecast endpoint's ragged tail.
 *
 * Mirror of `window_source` in `backend/app/models.py`, with the same example
 * table in both test suites.
 */
export function windowSource(
  startMs: number,
  endMs: number,
  nowMs: number = Date.now(),
  limits: WindowLimits = FALLBACK_WINDOW_LIMITS,
): WindowSource {
  const boundary = archiveBoundaryMs(nowMs, limits)
  if (endMs < boundary) return 'archive'
  if (startMs >= boundary - ARCHIVE_STRADDLE_DAYS * DAY_MS) return 'forecast'
  return 'spanning'
}

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
  limits: WindowLimits = FALLBACK_WINDOW_LIMITS,
): ResolvedWindow {
  const { startMs, endMs } = normalizeWindow(parseIso(startIso), parseIso(endIso))

  if (startMs >= endMs) {
    throw new Error('The start date must be before the end date.')
  }
  if (startMs < nowMs - limits.maxPastDays * DAY_MS) {
    throw new Error(
      'start_datetime is beyond the one-year history limit of the weather API. ' +
        'Move the window start closer to today.',
    )
  }
  if (endMs > nowMs + limits.maxFutureDays * DAY_MS) {
    throw new Error(
      'end_datetime is beyond the ~16-day forecast horizon of the weather API. ' +
        'Move the window end closer to today.',
    )
  }
  return { startMs, endMs }
}
