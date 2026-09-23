// The servable band: the first and last local day Open-Meteo answers for the
// selected model, the air-quality horizon inside it, and the two classifiers
// that hold a window up against them. The month grid and the warnings read the
// same functions, so a day the grid draws as unpickable and a window the
// warning calls out of range can never be different sets.

import { DAY_END, DAY_START, addDays, dayKey, isValidDatetimeLocal } from './calendarDates'

// The servable band, as day offsets from today. These live here rather than in
// urlState.ts because the calendar is what makes them visible: they are the
// band, and the window warnings at the foot of this file read them too.
//
// Both edges are measured, not taken from the docs. Probed 2026-07-31 against
// the forecast endpoint, which answered every out-of-range request with a 400
// naming its own limits (`2026-04-29 to 2026-08-15`):
//
//   today - 93  ->  200, 24 hourly values     today - 94  ->  400
//   today + 15  ->  200, 24 hourly values     today + 16  ->  400
//
// The FUTURE edge is 15 and the 16 this used to hold was off by one: Open-Meteo
// advertises "16 days" counting today. The old date inputs carried the same +16
// as their `max`, so the last day the picker offered was one the API refuses —
// a 400 nobody hit often because it took typing a date to reach.
//
// Note what that 400 does and does not prove. It is the edge past which the API
// refuses a DATE, which is not the edge past which it has DATA — see
// `PAST_DATA_DAYS` in `forecastWindow.ts`, and each model's published
// `forecast_hours` for the same distinction at the far end. Re-probe before
// changing it.
export const FUTURE_LIMIT_DAYS = 15

// How far back the band reaches is no longer compiled here at all (#123). The
// forecast endpoint's own data stops at `PAST_DATA_DAYS` (`forecastWindow.ts`,
// mirroring the backend), and past that the archive endpoint answers — a year
// back, which is a deployment choice rather than an API edge and therefore
// published by `/api/capabilities`. So it arrives as `BandLimits.pastDays`
// beside the model's reach, and `useCapabilities.ts` holds the fallback for the
// moment before that answers.

// The air-quality endpoint's CAMS model publishes far less forecast than the
// weather endpoint does, so days past its horizon are still analyzable but come
// back with no AQI. The calendar dims them (see `DayCell.availability`).
//
// A FALLBACK, like the archive's reach above and for the same reason: the
// horizon is published as `limits.aqi_forecast_days` and arrives on
// `BandLimits.aqiDays`. Nothing in this module reads this constant — it exists
// for `useCapabilities.ts` to hold until the fetch answers (#393).
export const AQI_LIMIT_DAYS = 5

/**
 * The two edges of the servable band, as one value.
 *
 * One object rather than three number parameters because all three move: the
 * far edge with the selected model (`forecastHours`), and the near edge and the
 * air-quality horizon with what `/api/capabilities` publishes (`pastDays`,
 * `aqiDays`). As bare numbers they are adjacent arguments of the same type and
 * similar magnitude — a model's reach in hours against a year of days — so a
 * transposed pair would compile and quietly redraw the grid.
 */
export interface BandLimits {
  /** Hours ahead the selected model still holds data for. The far edge. */
  forecastHours: number
  /** Days back the archive reaches. The near edge. */
  pastDays: number
  /** Days ahead air quality reaches. Marks days inside the band, not an edge. */
  aqiDays: number
}

/**
 * The earliest local day Open-Meteo will serve.
 *
 * No UTC correction needed here, unlike `bandEnd` below: the archive holds every
 * hour of the day at its near edge, and the edge itself is a deployment choice
 * rather than a cliff in the data, so a local midnight borrowing from the
 * previous UTC date lands on a day the archive answers just as readily.
 */
export function bandStart(now: Date, band: BandLimits): string {
  return addDays(dayKey(now), -band.pastDays)
}

/** The UTC calendar date an instant falls on, which is what the API is asked for. */
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The instant the selected model's data runs out.
 *
 * Deliberately an instant and not a day. A model's reach is set by when its
 * last run started, so it lands mid-afternoon as readily as at midnight, and a
 * whole-day answer would have to round — in whichever direction, wrongly. HRRR
 * is the case that proves it: rounded down to whole servable days it offers
 * *today only* anywhere west of Greenwich, which for a model whose entire
 * purpose is tomorrow morning in the mountains is the same as not offering it.
 */
export function modelEnd(now: Date, forecastHours: number): number {
  return now.getTime() + forecastHours * 3_600_000
}

/**
 * The latest local day Open-Meteo will serve any of, for this model.
 *
 * Two different edges bound this and only one is per model.
 *
 * The HARD edge is the API's: it refuses a window ending past ~16 days with a
 * 400, whatever model was asked for. That one is walked back rather than
 * computed, because the window is local and the request is not. Every fetch
 * sends `start_hour`/`end_hour` stamped in UTC (`utcHour` in `openMeteo.ts`,
 * `hour_param` in `weather.py`), and the API's own far limit is a UTC date.
 * West of Greenwich a local day's last minute therefore lands on the *next* UTC
 * date: 23:59 Pacific on the 15th is 06:59 UTC on the 16th, one day past what
 * the API will accept, and the request comes back a 400. East of Greenwich it
 * does not. So the answer is genuinely zone-dependent — Pacific gets today + 14,
 * London today + 15 — and offering a fixed 14 everywhere would cost the eastern
 * half of the world a real day of forecast. The loop runs at most once for any
 * real offset; it is a loop rather than a subtraction so a future zone with a
 * stranger offset cannot slip past it.
 *
 * The SOFT edge is the model's, and it is soft in the literal sense: asking
 * past it is not an error. The array comes back the length you asked for with
 * nulls where the model stopped. So the last day worth offering is the one the
 * model's reach lands *in*, partial or not — `monthGrid` marks it — rather than
 * the last one it covers end to end.
 */
export function bandEnd(now: Date, band: BandLimits): string {
  const utcLimit = utcDayKey(now.getTime() + FUTURE_LIMIT_DAYS * 86_400_000)
  let hard = addDays(dayKey(now), FUTURE_LIMIT_DAYS)
  while (utcDayKey(Date.parse(`${hard}T${DAY_END}`)) > utcLimit) {
    hard = addDays(hard, -1)
  }
  const soft = dayKey(new Date(modelEnd(now, band.forecastHours)))
  return soft < hard ? soft : hard
}

/** Is this day inside the servable band? String compare: keys sort as dates. */
export function inBand(key: string, now: Date, band: BandLimits): boolean {
  return key >= bandStart(now, band) && key <= bandEnd(now, band)
}

/** The last day the air-quality model reaches. Days past it are marked. */
export function aqiHorizon(now: Date, aqiDays: number): string {
  return addDays(dayKey(now), aqiDays)
}

/**
 * Classify a forecast window against Open-Meteo's servable range. `now` is
 * injected for deterministic testing. The whole window must fit inside the
 * servable band: Open-Meteo rejects requests whose dates fall outside it, so
 * even a partial overhang would fail upstream. Returns 'order' when the end is
 * before the start, 'past' when the window starts before the history horizon,
 * and 'future' when it ends beyond the forecast horizon.
 *
 * Crossing the archive boundary is NOT one of these (#123). Both endpoints
 * answer such a window, split at the seam, so nothing about it blocks an
 * analysis — the panel names where the join falls instead (`archiveSeamPhrase`).
 *
 * Bounded by whole days rather than by an instant `now + N * 24h`, because that
 * is the granularity of everything it is standing in for: the API states its own
 * far limit as a UTC date, and the calendar offers whole days. Measuring from the
 * instant made the last day of the band unusable — a window ending at its 23:59
 * always overshot `now + 15 days` unless you happened to be looking at 23:59 —
 * so the calendar's own far edge failed the check that is supposed to guard it.
 *
 * The calendar cannot produce an out-of-band day — those cells are drawn
 * disabled — so the horizon cases now only reach a user through a shared or
 * hand-edited link, which is precisely why they still have to be caught. 'order'
 * is reachable directly: it is a narrow-hours pair set end-before-start on a
 * single day.
 *
 * A zero-length window is no longer a status of its own. It used to be, because
 * two of the three pickers owned zero-length analyses and the warning's job was
 * to send the user to one of them. Under the calendar, equal narrow hours *are*
 * the way to ask for a single hour, so flagging them would refuse the thing the
 * control is for.
 */
export function classifyWindow(
  startDatetime: string,
  endDatetime: string,
  now: Date,
  band: BandLimits,
): 'ok' | 'order' | 'past' | 'future' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'ok' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const earliest = Date.parse(`${bandStart(now, band)}T${DAY_START}`)
  // Reads the same band the calendar draws, so a window the grid shows as
  // unpickable and a window this calls 'future' can never be different sets —
  // which is why the model's reach has to reach this function rather than only
  // the grid.
  const latest = Date.parse(`${bandEnd(now, band)}T${DAY_END}`)

  // A reversed window is a user error, not a horizon problem — flag it first so
  // the message is about the hours the user just set, not the servable range.
  if (end < start) return 'order'
  if (start < earliest) return 'past'
  if (end > latest) return 'future'
  return 'ok'
}

/**
 * Classify how much of a forecast window the air-quality horizon covers.
 * 'full' means AQI data should span the whole window, 'partial' means only its
 * start, 'none' means the window begins beyond the horizon entirely. Purely
 * informational — analysis still runs, with missing AQI rendered as "—".
 *
 * Whole days again, and for a second reason beyond matching the API: the backend
 * clamps its own request to `min(end.date(), today + aqi_forecast_days)`
 * (`air_quality.py`), so coverage really does run to the end of the horizon day.
 * Measuring from an instant called a window ending that evening 'partial' while
 * the calendar drew the same day as fully covered, and one of the two had to be
 * wrong.
 */
export function classifyAqiCoverage(
  startDatetime: string,
  endDatetime: string,
  now: Date,
  aqiDays: number,
): 'full' | 'partial' | 'none' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'full' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const horizon = Date.parse(`${aqiHorizon(now, aqiDays)}T${DAY_END}`)

  if (start > horizon) return 'none'
  if (end > horizon) return 'partial'
  return 'full'
}
