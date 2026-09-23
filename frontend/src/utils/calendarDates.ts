// Calendar days and clock times as the strings the forecast window speaks:
// `YYYY-MM-DD` days and `HH:MM` times, both local. The rest of the calendar
// reads these rather than doing arithmetic of its own, because a local day is
// 23 or 25 hours on a DST transition and only the Date constructor's field
// overflow lands on the right one.

/** Whole-day bounds, in the `HH:MM` shape the narrow-hours inputs speak. */
export const DAY_START = '00:00'
// 23:59 rather than the next day's 00:00. The hourly filter is inclusive on
// both ends (`aggregation.py` `_weather_metrics`), so midnight-to-midnight catches 25
// stamps and double-counts the boundary hour into the precipitation total;
// 23:59 catches exactly the day's 24.
export const DAY_END = '23:59'

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

// datetime-local strings only — reject anything Date can't parse so a garbled
// value doesn't silently become "Invalid Date" downstream.
export function isValidDatetimeLocal(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}
