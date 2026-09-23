// The month grid the calendar draws: one cell per day, each marked by how much
// of it the band can serve, plus the month and weekday labels around it.

import { DAY_END, dayDate, dayKey, monthKey } from './calendarDates'
import { type BandLimits, aqiHorizon, inBand, modelEnd } from './calendarBand'

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
export function monthGrid(month: string, now: Date, band: BandLimits): DayCell[][] {
  const first = dayDate(`${month}-01`)
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const today = dayKey(now)
  const horizon = aqiHorizon(now, band.aqiDays)
  const modelLimit = modelEnd(now, band.forecastHours)

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
        availability: !inBand(key, now, band)
          ? 'unservable'
          : key > horizon || !modelCovers
            ? 'partial'
            : 'full',
      }
    }),
  )
}

/** Does this month hold any servable day? Bounds the month navigation. */
export function monthHasBandDay(month: string, now: Date, band: BandLimits): boolean {
  return monthGrid(month, now, band)
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
