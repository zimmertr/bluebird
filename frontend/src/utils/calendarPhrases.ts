// How a window says its own dates on screen: the results header's caption,
// the snapshot caption, and the archive seam line under Analyze, with the one
// rule that decides whether a date carries its year.

import { FALLBACK_WINDOW_LIMITS, archiveBoundaryMs, type WindowLimits } from './forecastWindow'
import { addDays, dayDate, dayKey } from './calendarDates'
import type { SelectionKind } from './calendarSelection'

function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/**
 * Does a window need its year spelled out?
 *
 * The archive reaches a year back (#123), so a report can describe last
 * September while the panel sits in this one, and "Sat, Sep 13" is then a date
 * the reader cannot place. The test is the WINDOW's years against the reader's,
 * either end of it: a window that ends in this year still started in another.
 *
 * One predicate for the results header and the panel's seam notice, so the two
 * can never disagree about whether a date carries its year.
 */
export function needsYear(startMs: number, endMs: number, now: Date): boolean {
  const year = now.getFullYear()
  return new Date(startMs).getFullYear() !== year || new Date(endMs).getFullYear() !== year
}

// The year sits after the day with no comma before it: `Intl` writes "Sep 13,
// 2025" for `year: 'numeric'`, and inside a phrase that already separates its
// parts with commas a third one reads as another field.
function withYear(text: string, ms: number, year: boolean): string {
  return year ? `${text} ${new Date(ms).getFullYear()}` : text
}

/** A month and day, as the seam notice names the two days it falls between. */
export function monthDay(ms: number, year = false): string {
  return withYear(
    new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    ms,
    year,
  )
}

function namedDay(ms: number, year = false): string {
  return withYear(
    new Date(ms).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    ms,
    year,
  )
}

/**
 * A window in words: "Mon, Aug 3", "Mon, Aug 3 to Fri, Aug 7", "Mon, Aug 3,
 * 6:00 AM to 6:00 PM".
 *
 * The clock is left out exactly when it says nothing — a selection covering
 * whole calendar days — and the second date is left out when both ends land on
 * one. Written with "to" rather than a dash so it reads aloud.
 *
 * Both ends carry the year, or neither does (`needsYear`): one date wearing a
 * year beside one without would read as a range that spans the New Year.
 */
export function windowPhrase(
  startMs: number,
  endMs: number,
  pointSample: boolean,
  now: Date = new Date(),
): string {
  const year = needsYear(startMs, endMs, now)
  const day = (ms: number) => namedDay(ms, year)
  if (pointSample) return `${day(startMs)}, ${clockTime(startMs)}`
  const sameDay = day(startMs) === day(endMs)
  if (isWholeDaySpan(startMs, endMs)) {
    return sameDay ? day(startMs) : `${day(startMs)} to ${day(endMs)}`
  }
  if (sameDay) return `${day(startMs)}, ${clockTime(startMs)} to ${clockTime(endMs)}`
  return `${day(startMs)}, ${clockTime(startMs)} to ${day(endMs)}, ${clockTime(endMs)}`
}

/**
 * What the results header says instead of a window, while a snapshot metric
 * ranks the field (#449).
 *
 * The window caption is the wrong statement under a snow ranking: the numbers
 * the rows are ordered by came off one day's analysis and would read the same
 * for any window the panel could ask for. So the caption names the day the
 * grid is from, and the noun is spelled by `metrics.ts` like every other.
 *
 * The date is parsed as a LOCAL day rather than through `Date.parse`, which
 * reads a bare `YYYY-MM-DD` as UTC midnight and would print the day before
 * everywhere west of Greenwich. `needsYear` is asked the same question the
 * window caption asks it — both ends of a one-day span — so a grid from last
 * winter carries its year exactly as a report from last winter does.
 *
 * Returns null for a date it cannot read, which is a server that sent one this
 * build does not understand: no caption is better than `as of Invalid Date`.
 */
export function snapshotCaption(
  noun: string,
  analysisDate: string,
  now: Date = new Date(),
): string | null {
  const parts = analysisDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  const [year, month, day] = parts
  const at = new Date(year, month - 1, day)
  if (Number.isNaN(at.getTime())) return null
  const ms = at.getTime()
  return `${noun} as of ${monthDay(ms, needsYear(ms, ms, now))}`
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
  now: Date = new Date(),
): string {
  if (kind === 'now') return `as of ${clockTime(startMs)}`
  return windowPhrase(startMs, endMs, pointSample, now)
}

/**
 * Where a window crossing the archive boundary is joined, in words (#123).
 *
 * The two dates are the archive's last full local day and the forecast
 * endpoint's first, which are consecutive: the boundary is an instant, and the
 * one-local-day straddle tolerance (`ARCHIVE_STRADDLE_DAYS`) is what makes the
 * day it lands in wholly the forecast endpoint's. So the reader is told the
 * truth about which day their report changes source on, in their own zone,
 * rather than about a UTC instant.
 *
 * The year rule is the results header's, from `needsYear` above, keyed on the
 * WINDOW rather than on the seam: a report of last September carries the year in
 * both places or in neither.
 */
export function archiveSeamPhrase(
  startMs: number,
  endMs: number,
  modelLabel: string,
  now: Date = new Date(),
  limits: WindowLimits = FALLBACK_WINDOW_LIMITS,
): string {
  // Through this module's own day helpers rather than millisecond arithmetic: a
  // local day is 23 or 25 hours on a DST transition, and subtracting 86,400,000
  // ms from a local midnight lands on the wrong date across one of them.
  const boundaryDay = dayKey(new Date(archiveBoundaryMs(now.getTime(), limits)))
  const firstForecastDay = dayDate(boundaryDay).getTime()
  const lastArchiveDay = dayDate(addDays(boundaryDay, -1)).getTime()
  const year = needsYear(startMs, endMs, now)
  return (
    `Archive data to ${monthDay(lastArchiveDay, year)}, ` +
    `${modelLabel} from ${monthDay(firstForecastDay, year)}.`
  )
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
