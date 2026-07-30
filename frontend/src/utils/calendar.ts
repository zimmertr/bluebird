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

// Open-Meteo's forecast endpoint serves roughly the last ~90 days of history
// through ~16 days ahead. Days outside that band are drawn but unpickable.
// These live here rather than in urlState.ts because the calendar is what makes
// them visible: they are the band, and urlState's warnings read them from here.
export const PAST_LIMIT_DAYS = 90
export const FUTURE_LIMIT_DAYS = 16

// The air-quality endpoint's CAMS model only publishes ~5 days of forecast —
// well short of the 16-day weather horizon — so days past it are marked in the
// grid and the panel's existing coverage warning explains the mark.
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

/** Which of the two shapes an analysis was, recorded on its snapshot. */
export type SelectionKind = ForecastSelection['kind']

/** The landing state: answerable with no input at all. */
export const DEFAULT_SELECTION: ForecastSelection = { kind: 'now' }

const DAY_MS = 86_400_000

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
 * month. Overflow is the Date constructor's, so the 31st of a 30-day month
 * lands on the 1st of the next rather than on nothing.
 */
export function dayInMonth(month: string, dayOfMonth: number): string {
  const [y, m] = month.split('-').map(Number)
  return dayKey(new Date(y, m - 1, dayOfMonth))
}

/** Shift a month by whole months. Day-of-month is irrelevant here. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Calendar days from `start` to `end` inclusive.
 *
 * Measured on UTC-anchored midnights rather than local ones so the count is
 * exactly the number of dates on the calendar even across a DST transition,
 * where the local span is 23 or 25 hours.
 */
export function dayCount(start: string, end: string): number {
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS) + 1
}

/** The two ends of a day pair in calendar order. */
export function orderDays(a: string, b: string): { startDate: string; endDate: string } {
  return a <= b ? { startDate: a, endDate: b } : { startDate: b, endDate: a }
}

/** The earliest and latest days Open-Meteo will serve, from `now`. */
export function bandStart(now: Date): string {
  return addDays(dayKey(now), -PAST_LIMIT_DAYS)
}
export function bandEnd(now: Date): string {
  return addDays(dayKey(now), FUTURE_LIMIT_DAYS)
}

/** Is this day inside the servable band? String compare: keys sort as dates. */
export function inBand(key: string, now: Date): boolean {
  return key >= bandStart(now) && key <= bandEnd(now)
}

/** The last day the air-quality model reaches. Days past it are marked. */
export function aqiHorizon(now: Date): string {
  return addDays(dayKey(now), AQI_LIMIT_DAYS)
}

/** One cell of the month grid. */
export interface DayCell {
  /** `YYYY-MM-DD`. */
  date: string
  /** Day of month, as drawn. */
  day: number
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean
  today: boolean
  /** Outside the servable band, so unpickable. */
  disabled: boolean
  /** Past the air-quality horizon: analyzable, but with no AQI. */
  beyondAqi: boolean
}

/**
 * The six-week grid for a month, always 42 cells so the calendar's height
 * cannot change as the user pages through months — a grid that grew a row
 * would shift every control below it in a 320px panel.
 *
 * Weeks start Sunday. The app is US-scoped in every other respect it can be
 * (imperial units, the EPA air-quality index, NIFC wildfire perimeters), so a
 * locale-derived first weekday would be the one place it was not.
 */
export function monthGrid(month: string, now: Date): DayCell[] {
  const first = dayDate(`${month}-01`)
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const today = dayKey(now)
  const horizon = aqiHorizon(now)
  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    const key = dayKey(d)
    cells.push({
      date: key,
      day: d.getDate(),
      inMonth: monthKey(key) === month,
      today: key === today,
      disabled: !inBand(key, now),
      beyondAqi: key > horizon,
    })
  }
  return cells
}

/** Does this month hold any servable day? Bounds the month navigation. */
export function monthHasBandDay(month: string, now: Date): boolean {
  return monthGrid(month, now).some((c) => c.inMonth && !c.disabled)
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
  const hours = current.kind === 'days' ? current.hours : undefined
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
 * The window a selection asks about, as the `datetime-local` strings the rest
 * of the app already speaks (`urlState`'s horizon and air-quality warnings, and
 * the ISO conversion in `App.tsx`).
 *
 * `now` reports the same moment twice: equal timestamps are how a point sample
 * travels, and the backend floors that to the hour containing it. A day
 * selection spans whole days unless narrowed.
 */
export function selectionLocalWindow(
  selection: ForecastSelection,
  now: Date,
): { start: string; end: string } {
  if (selection.kind === 'now') {
    const stamp = nowLocal(now)
    return { start: stamp, end: stamp }
  }
  const hours = selection.hours
  return {
    start: `${selection.startDate}T${hours ? hours.start : DAY_START}`,
    end: `${selection.endDate}T${hours ? hours.end : DAY_END}`,
  }
}

/**
 * The selection in one line, for the row above the grid: "Aug 3", "Aug 3 – Aug
 * 7 · 5 days". Deliberately terse — the full window, hours included, is spelled
 * out under the narrow-hours control and again over the results.
 */
export function selectionSummary(selection: ForecastSelection): string {
  if (selection.kind === 'now') return 'The current hour'
  const short = (key: string) =>
    dayDate(key).toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (selection.startDate === selection.endDate) return short(selection.startDate)
  const days = dayCount(selection.startDate, selection.endDate)
  return `${short(selection.startDate)} – ${short(selection.endDate)} · ${days} days`
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
 * a chosen window says what was asked for.
 */
export function windowCaption(
  kind: SelectionKind,
  startMs: number,
  endMs: number,
  pointSample: boolean,
): string {
  if (kind === 'now') return `as of ${clockTime(startMs)}`
  return `for ${windowPhrase(startMs, endMs, pointSample)}`
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
