import { describe, expect, it } from 'vitest'
import { stripDays, stripHours } from './hourStrip'

// The Score cell's strip (record 0307): the lit hours, a gap after a night,
// and the best stretch marked.
describe('stripHours', () => {
  it('keeps the lit hours, marks the gap a night leaves, and the best stretch', () => {
    const hours = [10, 20, 30, null, 50, 60, 70]
    const lit = [false, true, true, false, false, true, true]
    expect(stripHours(hours, lit, [5, 7])).toEqual([
      { score: 20, gap: false, best: false },
      { score: 30, gap: false, best: false },
      { score: 60, gap: true, best: true },
      { score: 70, gap: false, best: true },
    ])
  })

  it('draws nothing for a row the lens never scored', () => {
    expect(stripHours(null, null, null)).toEqual([])
    expect(stripHours([1, 2], undefined, null)).toEqual([])
  })
})

// The compact table's strip (record 0320): the lit hours by local day, each
// day named, the best stretch marked and no gaps, since a day is its block.
describe('stripDays', () => {
  // Vitest runs in America/Los_Angeles: 2026-11-21 08:00 and 09:00, then the
  // next day's 08:00, local.
  const sat8 = Date.parse('2026-11-21T08:00:00-08:00')
  const HOUR = 3_600_000
  const grid = [sat8, sat8 + HOUR, sat8 + 12 * HOUR, sat8 + 24 * HOUR]

  it('groups the lit hours by day, under each day\'s name', () => {
    const days = stripDays([40, 50, 10, 90], [true, true, false, true], [3, 4], grid)
    expect(days.map((d) => d.label)).toEqual(['Sat', 'Sun'])
    expect(days.map((d) => d.hours.map((h) => h.score))).toEqual([[40, 50], [90]])
    expect(days[1].hours[0].best).toBe(true)
    expect(days.flatMap((d) => d.hours).some((h) => h.gap)).toBe(false)
  })

  it('draws nothing for a row the lens never scored', () => {
    expect(stripDays(null, null, null, grid)).toEqual([])
  })
})
