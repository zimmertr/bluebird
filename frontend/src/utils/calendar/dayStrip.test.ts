import { describe, expect, it } from 'vitest'
import { type BandLimits, bandEnd } from './calendarBand'
import { selectedDays, stripDays, stripMark } from './dayStrip'

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
