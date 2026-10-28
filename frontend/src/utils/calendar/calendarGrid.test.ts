import { describe, expect, it } from 'vitest'
import { AQI_LIMIT_DAYS, type BandLimits, aqiHorizon, bandEnd } from './calendarBand'
import { addDays, dayDate } from './calendarDates'
import { monthGrid, monthHasBandDay, monthLabel, weekdayInitials } from './calendarGrid'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

// A reach long enough that the API's hard date edge binds before any model's
// does, so these assertions test the edge they mean to. 384 h is what GFS
// measured; ECMWF's floor is 336. HRRR's 42 is the interesting opposite, and
// calendarBand.test.ts gives it a block of its own.
//
// The near edge and the air-quality horizon ride in the same object (#123,
// #393). Both are what `/api/capabilities` publishes rather than measured API
// edges, and the fallbacks the hook compiles are the values used here.
const ARCHIVE_DAYS = 365
const LONG: BandLimits = {
  forecastHours: 384,
  pastDays: ARCHIVE_DAYS,
  aqiDays: AQI_LIMIT_DAYS,
}

describe('monthGrid', () => {
  const weeks = monthGrid('2026-07', NOW, LONG)
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
    expect(monthGrid('2026-08', NOW, LONG)).toHaveLength(6)
    // Feb 2027 starts on a Monday with 28 days: four weeks and a day, so five.
    expect(monthGrid('2027-02', NOW, LONG)).toHaveLength(5)
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
    expect(on(aqiHorizon(NOW, LONG.aqiDays))).toBe('full')
    expect(on(addDays(aqiHorizon(NOW, LONG.aqiDays), 1))).toBe('partial')
    // The far edge of the band is analyzable; the day after it is not.
    expect(on(bandEnd(NOW, LONG))).toBe('partial')
    expect(on(addDays(bandEnd(NOW, LONG), 1))).toBe('unservable')
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
    expect(monthHasBandDay('2026-07', NOW, LONG)).toBe(true)
    expect(monthHasBandDay('2026-05', NOW, LONG)).toBe(true)
    // The near edge reaches a year back now (#123), so the navigation runs to
    // the month holding that day and stops the month before it.
    expect(monthHasBandDay('2025-07', NOW, LONG)).toBe(true) // the band starts Jul 15
    expect(monthHasBandDay('2025-06', NOW, LONG)).toBe(false)
    expect(monthHasBandDay('2026-08', NOW, LONG)).toBe(false)
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
