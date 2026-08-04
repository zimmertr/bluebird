// The forecast window as a calendar: the servable band, the month grid drawn
// over it, and the selection a click or a drag produces.
//
// Every function here is pure and local-time by construction, which is the
// whole reason the module exists. Vitest runs in a bare node environment with
// no DOM (`vitest.config.ts` collects only `src/**/*.test.ts`), so a component
// cannot be rendered under test — anything about the calendar worth pinning has
// to live outside `ForecastCalendar.tsx`. That includes the interaction rules:
// what a click means given a pending anchor is the part most likely to regress,
// so it is a reducer here rather than a handler there.
//
// Local time is not incidental either. A calendar day is inherently local ("is
// August 3rd dry?"), while the backend does no timezone conversion at all and
// Open-Meteo is asked for UTC. So the browser owns the local-to-UTC edge, as it
// always has, and day arithmetic goes through the Date constructor's field
// overflow rather than adding 86,400,000 ms — a local day is 23 or 25 hours on
// a DST transition, and millisecond arithmetic would land on the wrong day.

import { nowLocal } from './datetimeLocal'

// The servable band, as day offsets from today. These live here rather than in
// urlState.ts because the calendar is what makes them visible: they are the
// band, and urlState's warnings read them from here.
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
// PAST_LIMIT_DAYS below, and each model's published `forecast_hours` for the
// same distinction at the far end. Re-probe before changing it.
export const FUTURE_LIMIT_DAYS = 15

// How far back the API still holds data, as opposed to how far back it accepts
// a date. This used to be one number (90, slack under the measured 93) on the
// assumption that a request the API accepts is a request it can answer. It is
// not: past roughly two months every model returns 200 with an hourly array of
// nothing but nulls, so the calendar offered ~30 days of history that could
// only ever come back empty, under every model alike.
//
// Probed 2026-08-01 at 47.42648,-120.85892, bisecting the last day back with
// any non-null hour: jma 69, gfs/ukmo 64, gem 63, ecmwf 62,
// meteofrance 60, hrrr/icon 58. Every model is fully populated
// through 56 and ragged at 58, so this is one floor for all of them rather
// than a per-model number: the spread is jitter around a single ~2-month
// retention. `PAST_DATA_DAYS` in `backend/app/models.py` is the same measurement
// and `/api/capabilities` publishes it. Re-probe before raising it.
export const PAST_LIMIT_DAYS = 55

// The air-quality endpoint's CAMS model only publishes ~5 days of forecast —
// well short of the weather horizon — so days past it are still analyzable but
// come back with no AQI. The calendar dims them (see `DayCell.availability`).
export const AQI_LIMIT_DAYS = 5

/** Whole-day bounds, in the `HH:MM` shape the narrow-hours inputs speak. */
export const DAY_START = '00:00'
// 23:59 rather than the next day's 00:00. The hourly filter is inclusive on
// both ends (`weather.py` `_metrics`), so midnight-to-midnight catches 25
// stamps and double-counts the boundary hour into the precipitation total;
// 23:59 catches exactly the day's 24.
export const DAY_END = '23:59'

/** Narrowed hours within a day selection, local, `HH:MM`. */
export interface DayHours {
  start: string
  end: string
}

/**
 * What the panel is asking about, as one value.
 *
 * `now` is the Analyze-click moment — no input of its own, which is why it is
 * the landing state (#161). `days` is one or more whole calendar days,
 * optionally narrowed to a span of hours. The two are mutually exclusive by
 * construction rather than by convention, which is what replaced the three
 * radios and their three parallel sets of live state.
 *
 * `hours` present means the narrow-hours disclosure is open; absent means whole
 * days. It applies once across the whole selection, not per day: `startDate` at
 * `hours.start` through `endDate` at `hours.end` is a single contiguous window,
 * because that is the only shape the backend's contiguous hourly filter can
 * express. Per-day masking (daylight hours on each of five days) is a real
 * feature and a real backend lift; it gets its own issue rather than a
 * misleading label here.
 */
export type ForecastSelection =
  | { kind: 'now' }
  | { kind: 'days'; startDate: string; endDate: string; hours?: DayHours }
  // The Dates arm freshly opened, before any day is picked (#242 review):
  // today is outlined but NOT selected — pre-selecting it painted the current
  // date as chosen the moment the picker opened, and "today" is what Current
  // already provides. No window exists in this state, so Analyze blocks on it.
  | { kind: 'days'; startDate: null; endDate: null; hours?: DayHours }

/** Which of the two shapes an analysis was, recorded on its snapshot. */
export type SelectionKind = ForecastSelection['kind']

/** The landing state: answerable with no input at all. */
export const DEFAULT_SELECTION: ForecastSelection = { kind: 'now' }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** A Date as its local calendar day, `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `YYYY-MM-DD` as local midnight on that day. */
export function dayDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** `YYYY-MM-DD` is a real day. Tolerant callers (URL decode) gate on this. */
export function isDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  return dayKey(dayDate(key)) === key
}

/** `HH:MM` on a 24-hour clock. */
export function isTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/**
 * Add one hour to a time in `HH:MM` format, clamping at DAY_END (23:59).
 * 22:00 -> 23:00, 23:00 -> 23:59, 23:59 -> 23:59.
 */
export function addOneHour(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (h >= 23) return DAY_END
  return `${pad(h + 1)}:${pad(m)}`
}

/**
 * Subtract one hour from a time in `HH:MM` format, clamping at DAY_START (00:00).
 * 01:00 -> 00:00, 00:30 -> 00:00, 00:00 -> 00:00.
 */
export function subtractOneHour(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (h <= 0) return DAY_START
  return `${pad(h - 1)}:${pad(m)}`
}

/**
 * Shift a day by whole days, through the Date constructor's field overflow so a
 * DST transition cannot move the result off the intended calendar day.
 */
export function addDays(key: string, n: number): string {
  const d = dayDate(key)
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

/** The month a day belongs to, `YYYY-MM`. */
export function monthKey(key: string): string {
  return key.slice(0, 7)
}

/**
 * The same day-of-month inside another month, for paging a keyboard focus by
 * month.
 *
 * Clamped to the target month's last day rather than allowed to overflow into
 * the next one. Page Up from the 31st of January has to land somewhere, and the
 * Date constructor's own answer is March 3rd — which is drawn in February's grid
 * as a trailing cell, so focus would be visible but in the wrong month. The 28th
 * is what a reader means by "the same place, one month back".
 */
export function dayInMonth(month: string, dayOfMonth: number): string {
  const [y, m] = month.split('-').map(Number)
  // Day 0 of the following month is the last day of this one.
  const last = new Date(y, m, 0).getDate()
  return `${month}-${pad(Math.min(dayOfMonth, last))}`
}

/** Shift a month by whole months. Day-of-month is irrelevant here. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** The two ends of a day pair in calendar order. */
export function orderDays(a: string, b: string): { startDate: string; endDate: string } {
  return a <= b ? { startDate: a, endDate: b } : { startDate: b, endDate: a }
}

/**
 * The earliest local day Open-Meteo will serve.
 *
 * No UTC correction needed here, unlike `bandEnd` below: the retention edge is
 * ragged over a day or two anyway (see `PAST_LIMIT_DAYS`), so the day a local
 * midnight can borrow from the previous UTC date is well inside the margin this
 * number already carries.
 */
export function bandStart(now: Date): string {
  return addDays(dayKey(now), -PAST_LIMIT_DAYS)
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
function modelEnd(now: Date, forecastHours: number): number {
  return now.getTime() + forecastHours * 3_600_000
}

/**
 * The latest local day Open-Meteo will serve any of, for this model.
 *
 * Two different edges bound this and only one is per model.
 *
 * The HARD edge is the API's: it refuses an `end_date` past ~16 days with a
 * 400, whatever model was asked for. That one is walked back rather than
 * computed, because the window is local and the request is not. Every fetch
 * sends `start_date`/`end_date` as UTC dates (`utcDate` in `openMeteo.ts`,
 * `end_dt.date()` in `weather.py`), and the API's own far limit is a UTC date.
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
export function bandEnd(now: Date, forecastHours: number): string {
  const utcLimit = utcDayKey(now.getTime() + FUTURE_LIMIT_DAYS * 86_400_000)
  let hard = addDays(dayKey(now), FUTURE_LIMIT_DAYS)
  while (utcDayKey(Date.parse(`${hard}T${DAY_END}`)) > utcLimit) {
    hard = addDays(hard, -1)
  }
  const soft = dayKey(new Date(modelEnd(now, forecastHours)))
  return soft < hard ? soft : hard
}

/** Is this day inside the servable band? String compare: keys sort as dates. */
export function inBand(key: string, now: Date, forecastHours: number): boolean {
  return key >= bandStart(now) && key <= bandEnd(now, forecastHours)
}

/** The last day the air-quality model reaches. Days past it are marked. */
export function aqiHorizon(now: Date): string {
  return addDays(dayKey(now), AQI_LIMIT_DAYS)
}

/**
 * How much of a day the app can tell you about. One field rather than a pair of
 * booleans because the three states are exclusive, and a cell that claimed to be
 * both unservable and air-quality-limited would be a bug the types allowed.
 */
export type DayAvailability =
  /** Every hour, both weather and air quality. */
  | 'full'
  /**
   * Some of it. Two things land here and they mean the same thing to a reader,
   * which is why they share a state rather than splitting the channel: a day
   * past the air-quality horizon (weather only), and the day the chosen model's
   * reach runs out partway through (fewer hours than a whole day).
   */
  | 'partial'
  /** Outside the servable band, so unpickable. */
  | 'unservable'

/** One cell of the month grid. */
export interface DayCell {
  /** `YYYY-MM-DD`. */
  date: string
  /** Day of month, as drawn. */
  day: number
  /**
   * False for the leading/trailing days borrowed from the adjacent months. Those
   * are rendered blank: they cannot be dimmed to mark themselves, because dim is
   * spoken for by `availability` below.
   */
  inMonth: boolean
  today: boolean
  /** Before today. Drives the "these are recorded conditions" note. */
  past: boolean
  availability: DayAvailability
}

/**
 * A month as the weeks it occupies, Sunday-first: 4 to 6 rows of 7 cells, where
 * the cells outside the month are placeholders the grid draws blank.
 *
 * Only the weeks the month actually reaches into. A fixed six rows would be
 * steadier — the controls below never shift as you page — but it renders a wholly
 * empty row for any month that starts and ends inside five weeks, and an empty
 * row in a bordered card reads as something failing to load. Better to move the
 * controls a row's height than to draw a hole.
 *
 * Weeks start Sunday. The app is US-scoped in every other respect it can be
 * (imperial units, the EPA air-quality index, NIFC wildfire perimeters), so a
 * locale-derived first weekday would be the one place it was not.
 */
export function monthGrid(month: string, now: Date, forecastHours: number): DayCell[][] {
  const first = dayDate(`${month}-01`)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const today = dayKey(now)
  const horizon = aqiHorizon(now)
  const modelLimit = modelEnd(now, forecastHours)

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + w * 7 + d,
      )
      const key = dayKey(date)
      // A day the model only reaches partway into is `partial` for the same
      // reason a day past the air-quality horizon is: the app can serve some of
      // it. Measured against the day's last minute, so the boundary day counts
      // as partial rather than full — which is the honest answer and also the
      // conservative one.
      const modelCovers = Date.parse(`${key}T${DAY_END}`) <= modelLimit
      return {
        date: key,
        day: date.getDate(),
        inMonth: monthKey(key) === month,
        today: key === today,
        past: key < today,
        availability: !inBand(key, now, forecastHours)
          ? 'unservable'
          : key > horizon || !modelCovers
            ? 'partial'
            : 'full',
      }
    }),
  )
}

/** Does this month hold any servable day? Bounds the month navigation. */
export function monthHasBandDay(month: string, now: Date, forecastHours: number): boolean {
  return monthGrid(month, now, forecastHours)
    .flat()
    .some((c) => c.inMonth && c.availability !== 'unservable')
}

/**
 * The localized weekday initials, in grid order, derived from a known week
 * rather than hardcoded so a non-English browser reads its own letters.
 */
export function weekdayInitials(): string[] {
  const fmt = new Intl.DateTimeFormat([], { weekday: 'narrow' })
  // 2026-02-01 is a Sunday; any Sunday would do.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 1, 1 + i)))
}

/** The month as its own heading: "August 2026". */
export function monthLabel(month: string): string {
  return dayDate(`${month}-01`).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

/**
 * Where a drag that starts on `day` should pivot.
 *
 * Grabbing either end of an existing range anchors on the *other* end, so
 * dragging an end adjusts that end instead of starting a new selection. That is
 * the "easy support for changing the dates around" the maintainer asked for,
 * and it costs one comparison rather than a pair of drag handles.
 */
export function dragAnchor(current: ForecastSelection, day: string): string {
  if (current.kind === 'days' && current.startDate !== current.endDate) {
    if (day === current.startDate) return current.endDate
    if (day === current.endDate) return current.startDate
  }
  return day
}

/** Carry a narrow-hours refinement across a change of days. */
function withHours(
  days: { startDate: string; endDate: string },
  current: ForecastSelection,
): ForecastSelection {
  let hours = current.kind === 'days' ? current.hours : undefined
  // When the new span is a single day AND the hours are reversed,
  // drop the hours entirely. An overnight span (18:00 to 06:00) is
  // valid on a multi-day range but impossible on a single day.
  if (hours && days.startDate === days.endDate && hours.end <= hours.start) {
    hours = undefined
  }
  return { kind: 'days', ...days, ...(hours ? { hours } : {}) }
}

/**
 * A completed drag from `from` to `to`, ordered. Committed on pointerup, never
 * during the move: a selection is App state, and setting it several times a
 * second would re-render the panel and re-run every derivation hanging off it
 * for a range the user has not finished choosing. (The URL write behind it is
 * debounced since #219, so that part is no longer the reason.)
 */
export function applyDayDrag(
  current: ForecastSelection,
  from: string,
  to: string,
): ForecastSelection {
  return withHours(orderDays(from, to), current)
}

/**
 * One click on a day, and what it leaves pending.
 *
 * The anchor is the whole interaction model: a click with no anchor selects
 * that single day and leaves it anchored, so the next click on a different day
 * extends to a range. Once a range is complete the anchor is spent, which is
 * what makes a click inside an existing range restart at that day rather than
 * needing a Clear first.
 */
export function applyDayClick(
  current: ForecastSelection,
  anchor: string | null,
  day: string,
): { selection: ForecastSelection; anchor: string | null } {
  if (anchor !== null && anchor !== day) {
    return { selection: withHours(orderDays(anchor, day), current), anchor: null }
  }
  return { selection: withHours({ startDate: day, endDate: day }, current), anchor: day }
}

/**
 * A selection refitted to a band that moved underneath it, or null if it still
 * fits.
 *
 * Changing the forecast model moves the far edge, sometimes by twelve days:
 * a window picked under ECMWF is mostly outside HRRR's. Clamping rather than
 * refusing is the call the maintainer made, and it is the right one — the
 * alternative is a picker that rejects your model because of a window you chose
 * before you knew the model mattered, leaving you to fix the window first and
 * guess by how much.
 *
 * Both ends are clamped independently, which also settles the case where the
 * whole range sits past the new edge: both land on it, and a range that has
 * lost every day it named collapses to the last day still available rather than
 * to nothing. Returning null for "unchanged" is what lets the caller warn only
 * when something actually moved — an equality check on the result would fire on
 * every model change.
 *
 * `now` needs no clamp: it is the current hour, which every model reaches.
 */
export function clampSelection(
  selection: ForecastSelection,
  now: Date,
  forecastHours: number,
): ForecastSelection | null {
  if (!hasDates(selection)) return null
  const first = bandStart(now)
  const last = bandEnd(now, forecastHours)
  const clamp = (day: string): string => (day < first ? first : day > last ? last : day)
  const startDate = clamp(selection.startDate)
  const endDate = clamp(selection.endDate)
  if (startDate === selection.startDate && endDate === selection.endDate) return null
  return { ...selection, startDate, endDate }
}

/** A day selection with real days, which is what a mode switch remembers. */
export type DaysSelection = { kind: 'days'; startDate: string; endDate: string; hours?: DayHours }

/** The Dates arm with actual dates picked — the only shape with a window. */
export function hasDates(selection: ForecastSelection): selection is DaysSelection {
  return selection.kind === 'days' && selection.startDate !== null
}

/**
 * Picking an arm of the control directly, rather than by acting inside one.
 *
 * The two arms are not symmetric. Now is a constant, so switching to it is
 * total. Days names a range, and pressing it says only *that* you want days —
 * so this has to produce one. It restores the last range the user had, because
 * the round trip Days → Now → Days is a comparison people actually make and
 * losing the range to it is the whole cost of the trip. Only when there is no
 * such range does it open EMPTY, today outlined but nothing selected: a
 * pre-selected today painted the current date as chosen before the user chose
 * anything, and a window anchored on today is what Current already provides
 * (#242 review). Analyze blocks until a day is picked.
 *
 * A remembered range is run back through `clampSelection`, because the band may
 * have moved under it while Now was live: a range picked under ECMWF is mostly
 * outside HRRR's reach, and restoring it unclamped would put the selection
 * somewhere the grid draws as unpickable.
 *
 * Switching to the arm already live returns the selection untouched, so the
 * pressed half of the segment is inert rather than a way to lose your range.
 */
export function applyModeSwitch(
  kind: SelectionKind,
  current: ForecastSelection,
  remembered: DaysSelection | null,
  now: Date,
  forecastHours: number,
): ForecastSelection {
  if (kind === current.kind) return current
  if (kind === 'now') return { kind: 'now' }
  const next: ForecastSelection = remembered ?? { kind: 'days', startDate: null, endDate: null }
  return clampSelection(next, now, forecastHours) ?? next
}

/**
 * The window a selection asks about, as the `datetime-local` strings the rest
 * of the app already speaks (`urlState`'s horizon and air-quality warnings, and
 * the ISO conversion in `App.tsx`).
 *
 * `now` reports the same moment twice: equal timestamps are how a point sample
 * travels, and the backend floors that to the hour containing it. A day
 * selection spans whole days unless narrowed. The Dates arm with nothing
 * picked has NO window, and returns null rather than inventing one — the
 * callers (warnings, Analyze) each have their own honest answer to "no
 * window yet".
 */
export function selectionLocalWindow(
  selection: ForecastSelection,
  now: Date,
): { start: string; end: string } | null {
  if (selection.kind === 'now') {
    const stamp = nowLocal(now)
    return { start: stamp, end: stamp }
  }
  if (!hasDates(selection)) return null
  const hours = selection.hours
  return {
    start: `${selection.startDate}T${hours ? hours.start : DAY_START}`,
    end: `${selection.endDate}T${hours ? hours.end : DAY_END}`,
  }
}

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function namedDay(ms: number): string {
  return new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * A window in words: "Mon, Aug 3", "Mon, Aug 3 to Fri, Aug 7", "Mon, Aug 3,
 * 6:00 AM to 6:00 PM".
 *
 * The clock is left out exactly when it says nothing — a selection covering
 * whole calendar days — and the second date is left out when both ends land on
 * one. Written with "to" rather than a dash so it reads aloud.
 */
export function windowPhrase(startMs: number, endMs: number, pointSample: boolean): string {
  if (pointSample) return `${namedDay(startMs)}, ${clockTime(startMs)}`
  const sameDay = namedDay(startMs) === namedDay(endMs)
  if (isWholeDaySpan(startMs, endMs)) {
    return sameDay ? namedDay(startMs) : `${namedDay(startMs)} to ${namedDay(endMs)}`
  }
  if (sameDay) return `${namedDay(startMs)}, ${clockTime(startMs)} to ${clockTime(endMs)}`
  return `${namedDay(startMs)}, ${clockTime(startMs)} to ${namedDay(endMs)}, ${clockTime(endMs)}`
}

/**
 * The analyzed window, stated on screen over the results.
 *
 * A multi-hour analysis used to carry no caption at all, so someone opening a
 * shared link had nothing on screen telling them which days they were reading.
 * The click-time sample keeps its own wording: it says when it was taken, where
 * a chosen window simply names itself. The window carries no "for": it sits
 * under the line it qualifies rather than after it, so the preposition had
 * nothing to attach to and was costing a phone real width.
 */
export function windowCaption(
  kind: SelectionKind,
  startMs: number,
  endMs: number,
  pointSample: boolean,
): string {
  if (kind === 'now') return `as of ${clockTime(startMs)}`
  return windowPhrase(startMs, endMs, pointSample)
}

/**
 * Does this window cover whole calendar days, local? True when it runs from
 * midnight to the last minute of a day, which is what an un-narrowed day
 * selection produces — and what lets the caption above leave the clock out.
 */
export function isWholeDaySpan(startMs: number, endMs: number): boolean {
  const s = new Date(startMs)
  const e = new Date(endMs)
  return (
    s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() === 23 && e.getMinutes() === 59
  )
}
