import { describe, expect, it } from 'vitest'
import { type BandLimits, bandEnd } from './calendarBand'
import { STRIP_DAY_MIN_PX, selectedDays, stripDays, stripMark, windowGrow } from './dayStrip'

// Local noon on a Wednesday in July, as the band's own tests use.
const NOW = new Date(2026, 6, 15, 12, 0)
const LONG: BandLimits = { forecastHours: 384, pastDays: 365, aqiDays: 5 }
const HRRR: BandLimits = { ...LONG, forecastHours: 48 }

// The strip (record 0311): today through the model's reach, one cell a day.
describe('stripDays', () => {
  it('runs from today to the band’s last day, today marked', () => {
    const days = stripDays(NOW, LONG)
    expect(days[0]).toMatchObject({ date: '2026-07-15', day: 15, today: true })
    expect(days[days.length - 1].date).toBe(bandEnd(NOW, LONG))
    expect(days.length).toBeLessThanOrEqual(16)
    expect(days.slice(1).every((d) => !d.today)).toBe(true)
  })

  it('stops where a short model stops', () => {
    const short = stripDays(NOW, HRRR)
    expect(short[short.length - 1].date).toBe(bandEnd(NOW, HRRR))
    expect(short.length).toBeLessThan(stripDays(NOW, LONG).length)
  })
})

describe('selectedDays and stripMark', () => {
  it('reads Current and an empty Dates as no days', () => {
    expect(selectedDays({ kind: 'now' })).toBeNull()
    expect(selectedDays({ kind: 'days', startDate: null, endDate: null })).toBeNull()
  })

  it('marks the ends and the days between', () => {
    const drawn = selectedDays({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-19' })
    expect(['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20'].map((d) => stripMark(drawn, d))).toEqual([
      null,
      'end',
      'range',
      'end',
      null,
    ])
    expect(stripMark(null, '2026-07-17')).toBeNull()
  })
})

// The window's days widen to about half the strip (record 0323), and on a
// narrow row no further than leaves every other day its number (record 0333).
describe('windowGrow', () => {
  const widthOf = (total: number, n: number, grow: number, px: number) => ({
    other: px / (total - n + n * grow),
    window: (px * grow) / (total - n + n * grow),
  })

  it('draws plain days with no window, or before the row is laid out on a window of all', () => {
    expect(windowGrow(16, 0, 800)).toBe(1)
    expect(windowGrow(4, 4, 800)).toBe(1)
  })

  it('gives two window days the desk\'s share on a wide row', () => {
    const grow = windowGrow(16, 2, 800)
    const { window } = widthOf(16, 2, grow, 800)
    expect((2 * window) / 800).toBeCloseTo(0.56, 5)
  })

  it('keeps every other day its number on a phone\'s row', () => {
    for (const px of [296, 328, 452]) {
      const grow = windowGrow(16, 2, px)
      expect(grow).toBeGreaterThanOrEqual(1)
      expect(widthOf(16, 2, grow, px).other).toBeGreaterThanOrEqual(STRIP_DAY_MIN_PX - 1e-9)
    }
  })

  it('never draws the window narrower than plain', () => {
    expect(windowGrow(16, 2, 250)).toBe(1)
  })
})
