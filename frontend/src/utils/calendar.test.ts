import { describe, expect, it } from 'vitest'
import {
  AQI_LIMIT_DAYS,
  DEFAULT_SELECTION,
  FUTURE_LIMIT_DAYS,
  ForecastSelection,
  PAST_LIMIT_DAYS,
  addDays,
  addMonths,
  applyDayClick,
  applyDayDrag,
  aqiHorizon,
  bandEnd,
  bandStart,
  dayCount,
  dayDate,
  dayInMonth,
  dayKey,
  dragAnchor,
  inBand,
  isDayKey,
  isTimeOfDay,
  isWholeDaySpan,
  monthGrid,
  monthHasBandDay,
  monthKey,
  monthLabel,
  orderDays,
  selectionLocalWindow,
  selectionSummary,
  weekdayInitials,
  windowCaption,
  windowPhrase,
} from './calendar'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

// The two 2026 transitions in the timezone vitest.config.ts pins. A local
// calendar day is 23 hours on the first and 25 on the second, which is the whole
// reason day arithmetic here goes through the Date constructor rather than
// adding 86,400,000 ms.
const SPRING_FORWARD = '2026-03-08'
const FALL_BACK = '2026-11-01'

const HOUR = 3_600_000
const MINUTE = 60_000

describe('day keys', () => {
  it('round-trips a Date through its local calendar day', () => {
    expect(dayKey(new Date(2026, 6, 4, 23, 59))).toBe('2026-07-04')
    expect(dayKey(dayDate('2026-01-09'))).toBe('2026-01-09')
  })

  it('reads a key as local midnight, not UTC midnight', () => {
    const d = dayDate('2026-07-04')
    expect(d.getHours()).toBe(0)
    expect(d.getDate()).toBe(4)
  })

  it('accepts real days and rejects impossible or malformed ones', () => {
    expect(isDayKey('2026-02-28')).toBe(true)
    expect(isDayKey('2028-02-29')).toBe(true) // a leap day
    expect(isDayKey('2026-02-29')).toBe(false) // not one
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('2026-7-4')).toBe(false)
    expect(isDayKey('yesterday')).toBe(false)
    expect(isDayKey('')).toBe(false)
  })

  it('accepts 24-hour times and rejects everything else', () => {
    expect(isTimeOfDay('00:00')).toBe(true)
    expect(isTimeOfDay('23:59')).toBe(true)
    expect(isTimeOfDay('24:00')).toBe(false)
    expect(isTimeOfDay('12:60')).toBe(false)
    expect(isTimeOfDay('6:00')).toBe(false)
    expect(isTimeOfDay('')).toBe(false)
  })
})

describe('day arithmetic', () => {
  it('shifts across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-07-15', 16)).toBe('2026-07-31')
  })

  // The invariant DST would break: a 23-hour day plus 86,400,000 ms lands in the
  // *next* day, and a 25-hour day lands back in the same one.
  it('lands on the next calendar day across both DST transitions', () => {
    expect(addDays(SPRING_FORWARD, 1)).toBe('2026-03-09')
    expect(addDays(SPRING_FORWARD, -1)).toBe('2026-03-07')
    expect(addDays(FALL_BACK, 1)).toBe('2026-11-02')
    expect(addDays(FALL_BACK, -1)).toBe('2026-10-31')
  })

  it('shifts months, wrapping the year', () => {
    expect(addMonths('2026-07', 1)).toBe('2026-08')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })

  it('names the month a day belongs to', () => {
    expect(monthKey('2026-07-04')).toBe('2026-07')
  })

  it('carries a day-of-month into another month, clamped to that month', () => {
    expect(dayInMonth('2026-08', 15)).toBe('2026-08-15')
    // Paging a keyboard focus off the 31st has to land somewhere, and it has to
    // land inside the month being drawn: the constructor's own overflow answer
    // (May 1st, March 3rd) is a trailing cell of the target month's grid, so
    // focus would be visible but a month adrift.
    expect(dayInMonth('2026-04', 31)).toBe('2026-04-30')
    expect(dayInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dayInMonth('2028-02', 31)).toBe('2028-02-29')
  })

  it('counts calendar days inclusively, DST included', () => {
    expect(dayCount('2026-07-15', '2026-07-15')).toBe(1)
    expect(dayCount('2026-07-15', '2026-07-19')).toBe(5)
    expect(dayCount('2026-03-06', '2026-03-10')).toBe(5) // spans the 23-hour day
    expect(dayCount('2026-10-30', '2026-11-03')).toBe(5) // spans the 25-hour day
    expect(dayCount('2026-12-30', '2027-01-02')).toBe(4)
  })

  it('orders a pair of days', () => {
    expect(orderDays('2026-07-19', '2026-07-15')).toEqual({
      startDate: '2026-07-15',
      endDate: '2026-07-19',
    })
    expect(orderDays('2026-07-15', '2026-07-15')).toEqual({
      startDate: '2026-07-15',
      endDate: '2026-07-15',
    })
  })
})

describe('the servable band', () => {
  it('runs from the history limit to the forecast horizon', () => {
    expect(bandStart(NOW)).toBe('2026-04-16')
    expect(bandEnd(NOW)).toBe('2026-07-31')
    expect(dayCount(bandStart(NOW), dayKey(NOW))).toBe(PAST_LIMIT_DAYS + 1)
    expect(dayCount(dayKey(NOW), bandEnd(NOW))).toBe(FUTURE_LIMIT_DAYS + 1)
  })

  // Exactness at the edges was untested before the calendar, and the calendar is
  // what makes it visible: these are the first and last cells a user can click.
  it('admits both boundary days and refuses the days beyond them', () => {
    expect(inBand(bandStart(NOW), NOW)).toBe(true)
    expect(inBand(addDays(bandStart(NOW), -1), NOW)).toBe(false)
    expect(inBand(bandEnd(NOW), NOW)).toBe(true)
    expect(inBand(addDays(bandEnd(NOW), 1), NOW)).toBe(false)
  })

  it('puts the air-quality horizon inside the weather one', () => {
    expect(aqiHorizon(NOW)).toBe('2026-07-20')
    expect(dayCount(dayKey(NOW), aqiHorizon(NOW))).toBe(AQI_LIMIT_DAYS + 1)
    expect(aqiHorizon(NOW) < bandEnd(NOW)).toBe(true)
  })
})

describe('monthGrid', () => {
  const july = monthGrid('2026-07', NOW)

  // Fixed at six weeks so the grid's height cannot change as months are paged:
  // a row appearing would shift every control below it in a 320px panel.
  it('is always six weeks, starting on the Sunday before the 1st', () => {
    expect(july).toHaveLength(42)
    expect(july[0].date).toBe('2026-06-28') // the Sunday before Wed Jul 1
    expect(dayDate(july[0].date).getDay()).toBe(0)
    expect(july[41].date).toBe('2026-08-08')
  })

  it('marks which cells belong to the month being drawn', () => {
    expect(july.filter((c) => c.inMonth)).toHaveLength(31)
    expect(july.find((c) => c.date === '2026-06-30')?.inMonth).toBe(false)
    expect(july.find((c) => c.date === '2026-07-01')?.inMonth).toBe(true)
  })

  it('marks exactly one cell as today', () => {
    expect(july.filter((c) => c.today).map((c) => c.date)).toEqual(['2026-07-15'])
  })

  it('disables the days outside the band and nothing inside it', () => {
    const disabled = july.filter((c) => c.disabled).map((c) => c.date)
    // July 31 is the horizon itself, so the first refusal is August 1.
    expect(disabled).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
    ])
    expect(july.find((c) => c.date === '2026-07-31')?.disabled).toBe(false)
  })

  it('marks the days past the air-quality horizon, and not the horizon itself', () => {
    expect(july.find((c) => c.date === aqiHorizon(NOW))?.beyondAqi).toBe(false)
    expect(july.find((c) => c.date === '2026-07-21')?.beyondAqi).toBe(true)
    expect(july.find((c) => c.date === '2026-07-15')?.beyondAqi).toBe(false)
  })

  it('knows which months hold something pickable, to bound the navigation', () => {
    expect(monthHasBandDay('2026-07', NOW)).toBe(true)
    expect(monthHasBandDay('2026-04', NOW)).toBe(true) // the band starts Apr 16
    expect(monthHasBandDay('2026-03', NOW)).toBe(false)
    expect(monthHasBandDay('2026-08', NOW)).toBe(false)
  })
})

describe('grid chrome', () => {
  it('names seven weekdays, starting with the column the grid starts on', () => {
    const initials = weekdayInitials()
    expect(initials).toHaveLength(7)
    expect(initials[0]).toBe('S') // Sunday, matching monthGrid's first column
  })

  it('titles the month with its name and year', () => {
    expect(monthLabel('2026-07')).toContain('2026')
    expect(monthLabel('2026-07')).toContain('July')
  })
})

describe('picking days', () => {
  const single: ForecastSelection = { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' }
  const range: ForecastSelection = { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-19' }

  it('selects one whole day on a first click, and leaves it anchored', () => {
    const { selection, anchor } = applyDayClick(DEFAULT_SELECTION, null, '2026-07-15')
    expect(selection).toEqual(single)
    expect(anchor).toBe('2026-07-15')
  })

  it('extends to a range on the next click, spending the anchor', () => {
    const { selection, anchor } = applyDayClick(single, '2026-07-15', '2026-07-19')
    expect(selection).toEqual(range)
    expect(anchor).toBeNull()
  })

  it('orders the range however the two clicks came in', () => {
    expect(applyDayClick(single, '2026-07-19', '2026-07-15').selection).toEqual(range)
  })

  // The alternative was making the user clear first, which the maintainer called
  // out as the thing to avoid.
  it('restarts at the day clicked inside an existing range', () => {
    const { selection, anchor } = applyDayClick(range, null, '2026-07-17')
    expect(selection).toEqual({
      kind: 'days',
      startDate: '2026-07-17',
      endDate: '2026-07-17',
    })
    expect(anchor).toBe('2026-07-17')
  })

  it('re-clicking the anchored day keeps it a single day', () => {
    const { selection, anchor } = applyDayClick(single, '2026-07-15', '2026-07-15')
    expect(selection).toEqual(single)
    expect(anchor).toBe('2026-07-15')
  })

  it('keeps the narrowed hours across a change of days', () => {
    const narrowed: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-15',
      hours: { start: '06:00', end: '18:00' },
    }
    expect(applyDayClick(narrowed, null, '2026-07-20').selection).toEqual({
      kind: 'days',
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('leaves no hours behind when coming from the current-hour selection', () => {
    expect(applyDayClick({ kind: 'now' }, null, '2026-07-15').selection).toEqual(single)
  })

  it('commits a drag as an ordered range', () => {
    expect(applyDayDrag(single, '2026-07-19', '2026-07-15')).toEqual(range)
    expect(applyDayDrag(single, '2026-07-15', '2026-07-19')).toEqual(range)
  })

  // Grabbing an end pivots on the other one, which is what makes dragging an end
  // adjust that end instead of starting a new selection.
  it('pivots a drag on the opposite end of an existing range', () => {
    expect(dragAnchor(range, '2026-07-15')).toBe('2026-07-19')
    expect(dragAnchor(range, '2026-07-19')).toBe('2026-07-15')
  })

  it('pivots on the pressed day everywhere else', () => {
    expect(dragAnchor(range, '2026-07-17')).toBe('2026-07-17')
    expect(dragAnchor(single, '2026-07-15')).toBe('2026-07-15')
    expect(dragAnchor({ kind: 'now' }, '2026-07-15')).toBe('2026-07-15')
  })
})

describe('selectionLocalWindow', () => {
  it('reports the current hour as the same moment twice', () => {
    const { start, end } = selectionLocalWindow({ kind: 'now' }, NOW)
    expect(start).toBe('2026-07-15T12:00')
    expect(end).toBe(start)
  })

  it('spans a whole day from midnight to the last minute', () => {
    expect(
      selectionLocalWindow(
        { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T00:00', end: '2026-07-15T23:59' })
  })

  it('spans a range from the first day to the last', () => {
    expect(
      selectionLocalWindow(
        { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-19' },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T00:00', end: '2026-07-19T23:59' })
  })

  it('uses the narrowed hours on both ends when they are set', () => {
    expect(
      selectionLocalWindow(
        {
          kind: 'days',
          startDate: '2026-07-15',
          endDate: '2026-07-19',
          hours: { start: '06:00', end: '18:00' },
        },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T06:00', end: '2026-07-19T18:00' })
  })

  // 23:59 rather than the next midnight is what keeps a whole day 24 hourly
  // stamps under the backend's inclusive filter, and it is also what makes the
  // span below fall one minute short of a round day.
  it('measures a plain day as very nearly 24 hours', () => {
    const { start, end } = selectionLocalWindow(
      { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' },
      NOW,
    )
    expect(Date.parse(end) - Date.parse(start)).toBe(24 * HOUR - MINUTE)
  })

  it('measures a spring-forward day as 23 hours and a fall-back day as 25', () => {
    const span = (date: string) => {
      const { start, end } = selectionLocalWindow(
        { kind: 'days', startDate: date, endDate: date },
        NOW,
      )
      return Date.parse(end) - Date.parse(start)
    }
    expect(span(SPRING_FORWARD)).toBe(23 * HOUR - MINUTE)
    expect(span(FALL_BACK)).toBe(25 * HOUR - MINUTE)
  })
})

describe('saying what is selected', () => {
  it('summarizes each shape for the row above the grid', () => {
    expect(selectionSummary({ kind: 'now' })).toBe('The current hour')
    expect(
      selectionSummary({ kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' }),
    ).toBe('Jul 15')
    expect(
      selectionSummary({ kind: 'days', startDate: '2026-07-15', endDate: '2026-07-19' }),
    ).toBe('Jul 15 – Jul 19 · 5 days')
  })

  const localMs = (s: string) => Date.parse(s)

  it('leaves the clock out of a whole-day window', () => {
    expect(
      windowPhrase(localMs('2026-07-15T00:00'), localMs('2026-07-15T23:59'), false),
    ).toBe('Wed, Jul 15')
    expect(
      windowPhrase(localMs('2026-07-15T00:00'), localMs('2026-07-19T23:59'), false),
    ).toBe('Wed, Jul 15 to Sun, Jul 19')
  })

  it('names both hours on a narrowed day, and the second date only when it differs', () => {
    expect(
      windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-15T18:00'), false),
    ).toBe('Wed, Jul 15, 6:00 AM to 6:00 PM')
    expect(
      windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-19T18:00'), false),
    ).toBe('Wed, Jul 15, 6:00 AM to Sun, Jul 19, 6:00 PM')
  })

  it('states a single moment once', () => {
    expect(windowPhrase(localMs('2026-07-15T06:00'), localMs('2026-07-15T06:00'), true)).toBe(
      'Wed, Jul 15, 6:00 AM',
    )
  })

  it('captions the current hour by when it was taken, and a window by what it covers', () => {
    expect(windowCaption('now', localMs('2026-07-15T12:34'), localMs('2026-07-15T12:34'), true)).toBe(
      'as of 12:34 PM',
    )
    expect(
      windowCaption('days', localMs('2026-07-15T00:00'), localMs('2026-07-19T23:59'), false),
    ).toBe('for Wed, Jul 15 to Sun, Jul 19')
  })

  it('recognizes a whole-day span by its edges', () => {
    expect(isWholeDaySpan(localMs('2026-07-15T00:00'), localMs('2026-07-15T23:59'))).toBe(true)
    expect(isWholeDaySpan(localMs('2026-07-15T00:00'), localMs('2026-07-15T18:00'))).toBe(false)
    expect(isWholeDaySpan(localMs('2026-07-15T06:00'), localMs('2026-07-15T23:59'))).toBe(false)
  })
})

describe('the default selection', () => {
  // #161 made the no-input answer the landing state on purpose: the first
  // question most people arrive with needs no dates to ask.
  it('is the current hour, so a fresh load can Analyze with no input', () => {
    expect(DEFAULT_SELECTION).toEqual({ kind: 'now' })
  })
})
