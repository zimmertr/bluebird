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
  clampSelection,
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
  weekdayInitials,
  windowCaption,
  windowPhrase,
} from './calendar'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

// A reach long enough that the API's hard date edge binds before any model's
// does, so these assertions test the edge they mean to. 384 h is what GFS
// measured; ECMWF's floor is 336. HRRR's 42 is the interesting opposite and
// gets its own describe block below.
const LONG_HOURS = 384
const HRRR_HOURS = 42

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
  it('runs back exactly the history limit', () => {
    expect(bandStart(NOW)).toBe('2026-05-21')
    expect(addDays(dayKey(NOW), -PAST_LIMIT_DAYS)).toBe(bandStart(NOW))
  })

  // The far edge is one day short of the nominal offset here, and that is the
  // point: the request carries UTC dates, and 23:59 Pacific on the 30th is 06:59
  // UTC on the 31st — one day past what the API accepts, so the whole batch 400s.
  // In a zone at or east of Greenwich the same call returns today + 15, which is
  // why this is walked rather than subtracted. (vitest.config.ts pins Pacific.)
  it('stops at the last local day the API will serve the whole of', () => {
    const nominal = addDays(dayKey(NOW), FUTURE_LIMIT_DAYS)

    expect(nominal).toBe('2026-07-30')
    expect(bandEnd(NOW, LONG_HOURS)).toBe('2026-07-29')
    // And the last minute it offers really does fall inside the API's UTC limit.
    const limit = new Date(NOW.getTime() + FUTURE_LIMIT_DAYS * 86_400_000)
    expect(new Date(`${bandEnd(NOW, LONG_HOURS)}T23:59`).toISOString().slice(0, 10)).toBe(
      limit.toISOString().slice(0, 10),
    )
  })

  // Probed against the live forecast endpoint on 2026-07-31, which answered every
  // out-of-range request with a 400 naming its own limits:
  //
  //   today - 93 -> 200 (24 values)     today - 94 -> 400
  //   today + 15 -> 200 (24 values)     today + 16 -> 400
  //
  // So the far edge is exactly what the band offers. Re-probe before moving it.
  it('offers a far edge the weather service will actually serve', () => {
    expect(FUTURE_LIMIT_DAYS).toBe(15)
  })

  // The near edge is a different measurement from the one above and used to be
  // conflated with it. The 400 proves where the API stops accepting a DATE; it
  // says nothing about where it stops holding DATA, and the two are ~35 days
  // apart. Probed 2026-08-01 by bisecting the last day back with any non-null
  // hour: 58 for the shortest-retention model, 69 for the longest, every model
  // fully populated through 56. The band offered 90 and roughly its last 30 days
  // could only ever come back empty.
  it('offers a near edge the weather service still has data for', () => {
    expect(PAST_LIMIT_DAYS).toBe(55)
    // Comfortably inside the earliest measured cliff, and nowhere near the date
    // the API merely accepts.
    expect(PAST_LIMIT_DAYS).toBeLessThan(58)
    expect(PAST_LIMIT_DAYS).toBeLessThan(93)
  })

  // Exactness at the edges was untested before the calendar, and the calendar is
  // what makes it visible: these are the first and last cells a user can click.
  it('admits both boundary days and refuses the days beyond them', () => {
    expect(inBand(bandStart(NOW), NOW, LONG_HOURS)).toBe(true)
    expect(inBand(addDays(bandStart(NOW), -1), NOW, LONG_HOURS)).toBe(false)
    expect(inBand(bandEnd(NOW, LONG_HOURS), NOW, LONG_HOURS)).toBe(true)
    expect(inBand(addDays(bandEnd(NOW, LONG_HOURS), 1), NOW, LONG_HOURS)).toBe(false)
  })

  it('puts the air-quality horizon inside the weather one', () => {
    expect(aqiHorizon(NOW)).toBe('2026-07-20')
    expect(addDays(dayKey(NOW), AQI_LIMIT_DAYS)).toBe(aqiHorizon(NOW))
    expect(aqiHorizon(NOW) < bandEnd(NOW, LONG_HOURS)).toBe(true)
  })
})

// The far edge is the nearer of two limits and only one of them is per model.
// These pin which one binds, because getting it backwards is invisible: the
// calendar still draws a band, just the wrong one.
describe('the servable band under a short-range model', () => {
  // NOW is local noon on 2026-07-15, Pacific. HRRR's 42 h floor reaches
  // 2026-07-17T06:00 local, so the 17th is the last day it touches at all.
  it('ends on the day the model runs out, not the day the API stops accepting', () => {
    expect(bandEnd(NOW, HRRR_HOURS)).toBe('2026-07-17')
    // Twelve days nearer than the same call under a global model.
    expect(bandEnd(NOW, LONG_HOURS)).toBe('2026-07-29')
  })

  // The whole reason the reach is carried in hours. Rounded down to days the
  // model covers end to end, HRRR would offer today and nothing else in any
  // zone west of Greenwich, which for a model whose entire point is tomorrow
  // morning in the mountains is the same as not offering it.
  it('offers the day the reach lands in rather than the last whole day', () => {
    const grid = monthGrid('2026-07', NOW, HRRR_HOURS).flat()
    const on = (date: string) => grid.find((c) => c.date === date)?.availability
    expect(on('2026-07-15')).toBe('full') // today, covered end to end
    expect(on('2026-07-16')).toBe('full') // tomorrow, covered end to end
    expect(on('2026-07-17')).toBe('partial') // the reach ends at 06:00
    expect(on('2026-07-18')).toBe('unservable')
  })

  // The near edge is retention, not forecast reach, so it does not move.
  it('leaves the past edge alone', () => {
    expect(bandStart(NOW)).toBe(bandStart(NOW))
    expect(inBand('2026-06-01', NOW, HRRR_HOURS)).toBe(true)
    expect(inBand('2026-06-01', NOW, LONG_HOURS)).toBe(true)
  })

  it('bounds the month navigation by the model, not by the API', () => {
    expect(monthHasBandDay('2026-08', NOW, LONG_HOURS)).toBe(false)
    expect(monthHasBandDay('2026-07', NOW, HRRR_HOURS)).toBe(true)
  })
})

describe('clampSelection', () => {
  const days = (startDate: string, endDate: string): ForecastSelection => ({
    kind: 'days',
    startDate,
    endDate,
  })

  it('leaves a selection that still fits alone', () => {
    expect(clampSelection(days('2026-07-15', '2026-07-16'), NOW, HRRR_HOURS)).toBeNull()
  })

  // Null rather than an equal value is what lets the caller warn only when
  // something moved; an equality check on the result would fire every time.
  it('reports no change as null rather than as a copy', () => {
    const sel = days('2026-07-15', '2026-07-16')
    expect(clampSelection(sel, NOW, LONG_HOURS)).toBeNull()
  })

  it('trims an end that the new model no longer reaches', () => {
    expect(clampSelection(days('2026-07-15', '2026-07-28'), NOW, HRRR_HOURS)).toEqual(
      days('2026-07-15', '2026-07-17'),
    )
  })

  // Both ends clamp independently, which is what settles a range sitting
  // wholly past the new edge: it collapses onto the last day still available
  // rather than onto nothing.
  it('collapses a range that is entirely beyond the new edge', () => {
    expect(clampSelection(days('2026-07-25', '2026-07-28'), NOW, HRRR_HOURS)).toEqual(
      days('2026-07-17', '2026-07-17'),
    )
  })

  it('pulls a start from before the history limit back to it', () => {
    const clamped = clampSelection(days('2026-01-01', '2026-07-16'), NOW, LONG_HOURS)
    expect(clamped?.kind === 'days' && clamped.startDate).toBe(bandStart(NOW))
  })

  // Narrowed hours describe the span, not the days it covers, so a clamp that
  // moved the days keeps them rather than reopening the disclosure closed.
  it('carries narrowed hours across the clamp', () => {
    const sel: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-28',
      hours: { start: '06:00', end: '18:00' },
    }
    const clamped = clampSelection(sel, NOW, HRRR_HOURS)
    expect(clamped?.kind === 'days' && clamped.hours).toEqual({ start: '06:00', end: '18:00' })
  })

  // The current hour is the one selection every model reaches.
  it('never clamps the current-hour selection', () => {
    expect(clampSelection(DEFAULT_SELECTION, NOW, HRRR_HOURS)).toBeNull()
  })
})

describe('monthGrid', () => {
  const weeks = monthGrid('2026-07', NOW, LONG_HOURS)
  const july = weeks.flat()

  // Only the weeks the month reaches into. Six fixed rows would hold the controls
  // below steadier, but any month fitting in five weeks would draw a wholly empty
  // row, and an empty row inside a bordered card reads as a failure to load.
  it('spans only the weeks the month occupies, starting on a Sunday', () => {
    expect(weeks).toHaveLength(5) // Jul 2026: Wed 1st, 31 days
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(july[0].date).toBe('2026-06-28') // the Sunday before Wed Jul 1
    expect(dayDate(july[0].date).getDay()).toBe(0)
    expect(july[july.length - 1].date).toBe('2026-08-01')
  })

  it('takes a sixth week only when the month needs one', () => {
    // Aug 2026 starts on a Saturday and runs 31 days, so it spills into a sixth.
    expect(monthGrid('2026-08', NOW, LONG_HOURS)).toHaveLength(6)
    // Feb 2027 starts on a Monday with 28 days: four weeks and a day, so five.
    expect(monthGrid('2027-02', NOW, LONG_HOURS)).toHaveLength(5)
  })

  it('marks which cells belong to the month being drawn', () => {
    expect(july.filter((c) => c.inMonth)).toHaveLength(31)
    expect(july.find((c) => c.date === '2026-06-30')?.inMonth).toBe(false)
    expect(july.find((c) => c.date === '2026-07-01')?.inMonth).toBe(true)
  })

  it('marks exactly one cell as today', () => {
    expect(july.filter((c) => c.today).map((c) => c.date)).toEqual(['2026-07-15'])
  })

  // The ramp the grid draws as three brightness steps. Both boundaries are
  // asserted exactly, because an off-by-one at either one either offers a day the
  // API refuses or dims a day that has perfectly good data.
  it('grades each day by how much of it the app can serve', () => {
    const on = (date: string) => july.find((c) => c.date === date)?.availability

    // The air-quality horizon itself still has air quality; the day after it does not.
    expect(on(aqiHorizon(NOW))).toBe('full')
    expect(on(addDays(aqiHorizon(NOW), 1))).toBe('partial')
    // The far edge of the band is analyzable; the day after it is not.
    expect(on(bandEnd(NOW, LONG_HOURS))).toBe('partial')
    expect(on(addDays(bandEnd(NOW, LONG_HOURS), 1))).toBe('unservable')
    // And a day in the middle, plus one in the recent past, are fully covered.
    expect(on('2026-07-15')).toBe('full')
    expect(on('2026-06-29')).toBe('full')
  })

  it('grades every cell, and only past the far edge as unservable', () => {
    expect(july.filter((c) => c.availability === 'unservable').map((c) => c.date)).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ])
    expect(july.filter((c) => c.availability === 'partial')).toHaveLength(9) // Jul 21-29
    expect(july.filter((c) => c.availability === 'full')).toHaveLength(23)
  })

  // Read by the note saying a window is recorded rather than forecast. Today is
  // not past: its hours straddle the boundary and it is the anchor the ring marks.
  it('marks the days before today as past, and today as not', () => {
    expect(july.find((c) => c.date === '2026-07-14')?.past).toBe(true)
    expect(july.find((c) => c.date === '2026-07-15')?.past).toBe(false)
    expect(july.find((c) => c.date === '2026-07-16')?.past).toBe(false)
    expect(july.filter((c) => c.past)).toHaveLength(17) // Jun 28-30 + Jul 1-14
  })

  it('knows which months hold something pickable, to bound the navigation', () => {
    expect(monthHasBandDay('2026-07', NOW, LONG_HOURS)).toBe(true)
    expect(monthHasBandDay('2026-05', NOW, LONG_HOURS)).toBe(true) // the band starts May 21
    expect(monthHasBandDay('2026-04', NOW, LONG_HOURS)).toBe(false)
    expect(monthHasBandDay('2026-08', NOW, LONG_HOURS)).toBe(false)
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
    ).toBe('Wed, Jul 15 to Sun, Jul 19')
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
