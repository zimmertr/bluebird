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

export function resolveWindow(
  startIso: string,
  endIso: string,
  nowMs: number = Date.now(),
): ResolvedWindow {
  let startMs = parseIso(startIso)
  let endMs = parseIso(endIso)

  if (startMs === endMs) {
    startMs = startMs - (startMs % HOUR_MS)
    endMs = startMs + MINUTE_MS
  }
  if (startMs >= endMs) {
    throw new Error('The start date must be before the end date.')
  }
  if (startMs < nowMs - PAST_LIMIT_SLACK_DAYS * DAY_MS) {
    throw new Error(
      'start_datetime is beyond the ~90-day history limit of the weather API — ' +
        'move the window start closer to today.',
    )
  }
  if (endMs > nowMs + FUTURE_LIMIT_SLACK_DAYS * DAY_MS) {
    throw new Error(
      'end_datetime is beyond the ~16-day forecast horizon of the weather API — ' +
        'move the window end closer to today.',
    )
  }
  return { startMs, endMs }
}
