import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  addOneHour,
  dayDate,
  dayInMonth,
  dayKey,
  isDayKey,
  isTimeOfDay,
  monthKey,
  orderDays,
  subtractOneHour,
} from './calendarDates'

// The two 2026 transitions in the timezone vitest.config.ts pins. A local
// calendar day is 23 hours on the first and 25 on the second, which is the whole
// reason day arithmetic here goes through the Date constructor rather than
// adding 86,400,000 ms.
const SPRING_FORWARD = '2026-03-08'

const FALL_BACK = '2026-11-01'

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

describe('hour adjustment helpers', () => {
  it('adds one hour, clamping at 23:59', () => {
    expect(addOneHour('06:00')).toBe('07:00')
    expect(addOneHour('22:00')).toBe('23:00')
    expect(addOneHour('23:00')).toBe('23:59')
    expect(addOneHour('23:59')).toBe('23:59')
    expect(addOneHour('14:30')).toBe('15:30')
  })

  it('subtracts one hour, clamping at 00:00', () => {
    expect(subtractOneHour('07:00')).toBe('06:00')
    expect(subtractOneHour('01:00')).toBe('00:00')
    expect(subtractOneHour('00:30')).toBe('00:00')
    expect(subtractOneHour('00:00')).toBe('00:00')
    expect(subtractOneHour('15:30')).toBe('14:30')
  })
})
