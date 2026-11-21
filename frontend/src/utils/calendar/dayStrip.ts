// The day strip at a desk's map foot (record 0311): the days ahead the
// forecast reaches, one cell each, and which of them the window holds. Pure,
// for the calendar family's reason: the rules are pinned in node and the
// component keeps the wiring.

import { addDays, dayDate, dayKey } from './calendarDates'
import { type BandLimits, bandEnd } from './calendarBand'
import { type ForecastSelection, hasDates } from './calendarSelection'

/** One day on the strip. */
export interface StripDay {
  /** The local day's key, `YYYY-MM-DD`. */
  date: string
  /** Its weekday's initial in the browser's own language, as the calendar's head row reads. */
  weekday: string
  /** Its day of the month. */
  day: number
  today: boolean
}

/**
 * Today through the last day the model reaches, `bandEnd`'s, which is at most
 * sixteen. The strip looks ahead only: a window in the archive is the When
 * card's calendar, which pages back a year.
 */
export function stripDays(now: Date, band: BandLimits): StripDay[] {
  const fmt = new Intl.DateTimeFormat([], { weekday: 'narrow' })
  const first = dayKey(now)
  const last = bandEnd(now, band)
  const days: StripDay[] = []
  for (let key = first; key <= last; key = addDays(key, 1)) {
    const date = dayDate(key)
    days.push({ date: key, weekday: fmt.format(date), day: date.getDate(), today: key === first })
  }
  return days
}

/** The days a selection names, or null for Current and for Dates before a pick. */
export function selectedDays(selection: ForecastSelection): { startDate: string; endDate: string } | null {
  return hasDates(selection) ? { startDate: selection.startDate, endDate: selection.endDate } : null
}

/** How a day reads against the days drawn: an end of the range, inside it, or neither. */
export function stripMark(drawn: { startDate: string; endDate: string } | null, date: string): 'end' | 'range' | null {
  if (drawn === null) return null
  if (date === drawn.startDate || date === drawn.endDate) return 'end'
  return date > drawn.startDate && date < drawn.endDate ? 'range' : null
}
