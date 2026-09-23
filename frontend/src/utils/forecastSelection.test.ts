import { describe, expect, it } from 'vitest'
import { type BandLimits, type ForecastSelection, addDays, dayKey } from './calendar'
import { panelWindowMs, planModelChange, windowWarningFor } from './forecastSelection'

const NOW = new Date(2026, 8, 20, 10, 30)
const TODAY = dayKey(NOW)
const days = (from: number, to: number): ForecastSelection => ({
  kind: 'days',
  startDate: addDays(TODAY, from),
  endDate: addDays(TODAY, to),
})
const GFS: BandLimits = { forecastHours: 384, pastDays: 365, aqiDays: 5 }
const HRRR: BandLimits = { ...GFS, forecastHours: 42 }
const ICON: BandLimits = { ...GFS, forecastHours: 180 }

describe('planModelChange', () => {
  it('leaves a window the new model can serve alone', () => {
    const picked = days(2, 4)
    expect(planModelChange(picked, null, GFS, NOW)).toEqual({ selection: picked, clamped: false, remember: null })
  })

  it('clamps a window past the new edge and remembers the one it took away', () => {
    const picked = days(5, 8)
    const plan = planModelChange(picked, null, HRRR, NOW)
    expect(plan.clamped).toBe(true)
    expect(plan.remember).toBe(picked)
    expect(plan.selection).not.toEqual(picked)
  })

  // HRRR, then ICON, then GFS: the range to restore is the one the user
  // picked, not the wreck the middle clamp left.
  it('keeps the first window of a clamp chain and restores it when it fits', () => {
    const picked = days(5, 8)
    const first = planModelChange(picked, null, HRRR, NOW)
    const second = planModelChange(first.selection, first.remember, ICON, NOW)
    expect(second.remember).toBe(picked)
    const third = planModelChange(second.selection, second.remember, GFS, NOW)
    expect(third).toEqual({ selection: picked, clamped: false, remember: null })
  })

  it('never clamps the current hour', () => {
    const now: ForecastSelection = { kind: 'now' }
    expect(planModelChange(now, null, HRRR, NOW)).toEqual({ selection: now, clamped: false, remember: null })
  })
})

describe('panelWindowMs', () => {
  it('reads a window it is given', () => {
    const w = { start: '2026-09-21T00:00', end: '2026-09-21T23:59' }
    expect(panelWindowMs(w, NOW)).toEqual({ startMs: Date.parse(w.start), endMs: Date.parse(w.end) })
  })

  it('borrows the whole of today for a dateless selection', () => {
    const w = panelWindowMs(null, NOW)
    expect(dayKey(new Date(w.startMs))).toBe(TODAY)
    expect(dayKey(new Date(w.endMs))).toBe(TODAY)
    expect(w.endMs).toBeGreaterThan(w.startMs)
  })
})

describe('windowWarningFor', () => {
  it('says nothing about the current hour or a dateless selection', () => {
    expect(windowWarningFor({ kind: 'now' }, { start: '2020-01-01T00:00', end: '2020-01-01T01:00' }, NOW, GFS)).toBeNull()
    expect(windowWarningFor(days(1, 1), null, NOW, GFS)).toBeNull()
  })

  it('names a window past the band', () => {
    const far = { start: `${addDays(TODAY, 40)}T00:00`, end: `${addDays(TODAY, 40)}T23:59` }
    expect(windowWarningFor(days(40, 40), far, NOW, GFS)).toBe('future')
  })
})
