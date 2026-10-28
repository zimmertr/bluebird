import { describe, expect, it } from 'vitest'
import { airCalls, analysisCalls, modelCalls, spendOver, spendVeto, type SpendWindow } from './analysisSpend'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { callWeight } from './openMeteo'
import { CLOUD_VARIABLES, HOURLY_VARIABLES } from './openMeteoAggregate'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-22T12:00:00Z')

// Two days inside the air-quality horizon.
const SHORT: SpendWindow = {
  startMs: Date.parse('2026-10-24T00:00:00Z'),
  endMs: Date.parse('2026-10-25T23:00:00Z'),
  nowMs: NOW,
  windowLimits: FALLBACK_WINDOW_LIMITS,
  aqiForecastDays: 5,
}
// Thirty days starting past the air-quality horizon, so no air quality is asked.
const LONG: SpendWindow = {
  ...SHORT,
  startMs: Date.parse('2026-10-28T00:00:00Z'),
  endMs: Date.parse('2026-10-28T00:00:00Z') + 30 * DAY - 3_600_000,
}

const spend = (w: SpendWindow, destinations: number, comparedModels = 0, compareRows = 200) =>
  analysisCalls({ ...w, destinations, comparedModels, compareRows })

describe('analysisCalls', () => {
  it('prices weather, the cloud column and air quality for every destination', () => {
    // The reported case (#803): 2,613 destinations over two days. The issue's
    // 6,794 was weather and cloud alone; air quality adds one call each.
    expect(HOURLY_VARIABLES.length).toBe(16)
    expect(CLOUD_VARIABLES.length).toBe(9)
    expect(modelCalls(2613, SHORT, true)).toBeCloseTo(2613 * 2.6, 6)
    expect(airCalls(2613, SHORT)).toBeCloseTo(2613, 6)
    expect(spend(SHORT, 2613)).toBeCloseTo(2613 * 3.6, 6)
  })

  it('prices a long window by its days, and no air quality past the horizon', () => {
    // #803's D2: 1,500 destinations at 30 days is about 8,357 weighted calls.
    expect(airCalls(1500, LONG)).toBe(0)
    expect(spend(LONG, 1500)).toBeCloseTo(1500 * 2.6 * (30 / 14), 6)
    expect(Math.round(spend(LONG, 1500))).toBe(8357)
  })

  it("prices air quality on the hours fetchAqi asks for, not the window's", () => {
    // Sixteen days from now: air quality is asked through the horizon's day.
    const w = { ...SHORT, startMs: NOW, endMs: NOW + 16 * DAY }
    expect(airCalls(100, w)).toBe(callWeight(100, NOW, Date.parse('2026-10-27T23:00:00Z'), 1))
  })

  it("prices each compared model's weather for the rows the table shows", () => {
    const base = spend(SHORT, 1000)
    expect(spend(SHORT, 1000, 2, 200) - base).toBeCloseTo(2 * 200 * 1.6, 6)
    // Never more rows than the field has.
    expect(spend(SHORT, 50, 1, 200) - spend(SHORT, 50)).toBeCloseTo(50 * 1.6, 6)
  })

  it('prices a window crossing the archive boundary as its two spans', () => {
    const w = { ...SHORT, startMs: NOW - 70 * DAY, endMs: NOW }
    const whole = modelCalls(10, { ...w, windowLimits: { ...FALLBACK_WINDOW_LIMITS, pastDataDays: 400 } }, false)
    // Two requests per batch: never cheaper than one over the whole window.
    expect(modelCalls(10, w, false)).toBeGreaterThanOrEqual(whole)
  })

  it('costs nothing for nothing', () => {
    expect(spend(SHORT, 0)).toBe(0)
  })
})

describe('spendOver', () => {
  it('quotes a whole call, rounded up, only past the budget', () => {
    expect(spendOver(9406.8, 5000)).toEqual({ needed: 9407, limit: 5000 })
    expect(spendOver(5000, 5000)).toBeNull()
    expect(spendOver(4999.2, 5000)).toBeNull()
    // Binary fractions do not move a whole call.
    expect(spendOver(3 * 1.6 + 3 + 3 + 2 * 1.6, 13)).toEqual({ needed: 14, limit: 13 })
    expect(spendOver(3125 * 1.6, 5000)).toBeNull()
  })
})

describe('spendVeto', () => {
  const veto = (over: Partial<Parameters<typeof spendVeto>[0]> = {}) =>
    spendVeto({
      selection: { kind: 'days', startDate: '2026-10-24', endDate: '2026-10-25' },
      known: 2000,
      maxDestinations: 2500,
      comparedModels: 0,
      limit: 200,
      hourlyCalls: 5000,
      windowLimits: FALLBACK_WINDOW_LIMITS,
      aqiForecastDays: 5,
      now: new Date(NOW),
      ...over,
    })

  it('holds a field that costs more than the hourly budget', () => {
    expect(veto()).toEqual({ needed: 7200, limit: 5000 })
  })

  it('passes a field inside it', () => {
    expect(veto({ known: 1000 })).toBeNull()
  })

  it('is off with no count, no window, or a count over the cap, which has its own line', () => {
    expect(veto({ known: null })).toBeNull()
    expect(veto({ selection: { kind: 'days', startDate: null, endDate: null } })).toBeNull()
    expect(veto({ known: 2600 })).toBeNull()
  })
})
