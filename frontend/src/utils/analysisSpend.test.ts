import { describe, expect, it } from 'vitest'
import {
  NO_CALLS,
  airCalls,
  analysisCalls,
  modelCalls,
  spendOver,
  spendVeto,
  totalCalls,
  type SpendWindow,
} from './analysisSpend'
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

// Sixteen days starting inside the air-quality horizon.
const SIXTEEN: SpendWindow = { ...SHORT, endMs: SHORT.startMs + 16 * DAY - 3_600_000 }

const spend = (w: SpendWindow, destinations: number, comparedModels = 0, compareRows = 200) =>
  analysisCalls({ ...w, destinations, comparedModels, compareRows })
const forecastHost = (calls: number) => ({ ...NO_CALLS, forecast: calls })

describe('analysisCalls', () => {
  it('prices weather and the cloud column on the forecast host, and air quality on its own', () => {
    // The reported case (#803): 2,613 destinations over two days.
    expect(HOURLY_VARIABLES.length).toBe(16)
    expect(CLOUD_VARIABLES.length).toBe(9)
    const reported = spend(SHORT, 2613)
    expect(reported.forecast).toBeCloseTo(2613 * 2.6, 6)
    expect(reported.archive).toBe(0)
    expect(reported.airQuality).toBeCloseTo(2613, 6)
    expect(spendOver(reported, 5000)).toEqual({ needed: 6794, limit: 5000 })
    // Unticking unnamed peaks found 1,382, which fits on every host.
    expect(spendOver(spend(SHORT, 1382), 5000)).toBeNull()
    expect(Math.ceil(spend(SHORT, 1382).forecast)).toBe(3594)
  })

  // Per host, as record 0203 measured the minute: the weather host alone takes
  // the cap over sixteen days inside the hourly budget.
  it('passes the cap over sixteen days, and holds it with a model compared on every row', () => {
    const full = spend(SIXTEEN, 1500)
    expect(full.forecast).toBeCloseTo(1500 * 2.6 * (16 / 14), 6)
    expect(Math.round(full.forecast)).toBe(4457)
    expect(full.airQuality).toBeCloseTo(1500, 6)
    expect(spendOver(full, 5000)).toBeNull()
    const compared = spend(SIXTEEN, 1500, 1, 1500)
    expect(compared.forecast).toBeCloseTo(1500 * (2.6 + 1.6) * (16 / 14), 6)
    expect(spendOver(compared, 5000)).toEqual({ needed: 7200, limit: 5000 })
  })

  it('prices a long window by its days, and no air quality past the horizon', () => {
    // #803's D2: 1,500 destinations at 30 days is about 8,357 weighted calls.
    expect(airCalls(1500, LONG)).toEqual(NO_CALLS)
    expect(spend(LONG, 1500)).toEqual(forecastHost(spend(LONG, 1500).forecast))
    expect(Math.round(spend(LONG, 1500).forecast)).toBe(8357)
  })

  it("prices air quality on the hours fetchAqi asks for, not the window's", () => {
    // Sixteen days from now: air quality is asked through the horizon's day.
    const w = { ...SHORT, startMs: NOW, endMs: NOW + 16 * DAY }
    expect(airCalls(100, w).airQuality).toBe(callWeight(100, NOW, Date.parse('2026-10-27T23:00:00Z'), 1))
  })

  it("prices each compared model's weather for the rows the table shows", () => {
    const base = spend(SHORT, 1000)
    expect(spend(SHORT, 1000, 2, 200).forecast - base.forecast).toBeCloseTo(2 * 200 * 1.6, 6)
    expect(spend(SHORT, 1000, 2, 200).airQuality).toBe(base.airQuality)
    // Never more rows than the field has.
    expect(spend(SHORT, 50, 1, 200).forecast - spend(SHORT, 50).forecast).toBeCloseTo(50 * 1.6, 6)
  })

  it('books a window crossing the archive boundary to both hosts, a span each', () => {
    const w = { ...SHORT, startMs: NOW - 70 * DAY, endMs: NOW }
    const split = modelCalls(10, w, false)
    expect(split.archive).toBeGreaterThan(0)
    expect(split.forecast).toBeGreaterThan(0)
    expect(split.airQuality).toBe(0)
    // Two requests per batch: never cheaper than one over the whole window.
    const whole = modelCalls(10, { ...w, windowLimits: { ...FALLBACK_WINDOW_LIMITS, pastDataDays: 400 } }, false)
    expect(whole.archive).toBe(0)
    expect(totalCalls(split)).toBeGreaterThanOrEqual(whole.forecast)
  })

  it('costs nothing for nothing', () => {
    expect(spend(SHORT, 0)).toEqual(NO_CALLS)
  })
})

describe('spendOver', () => {
  it("quotes the dearest host's total, rounded up, only past the budget", () => {
    expect(spendOver({ forecast: 9406.8, archive: 0, airQuality: 6000 }, 5000)).toEqual({ needed: 9407, limit: 5000 })
    expect(spendOver({ forecast: 100, archive: 0, airQuality: 5000.5 }, 5000)).toEqual({ needed: 5001, limit: 5000 })
    // Hosts are not summed: each fits.
    expect(spendOver({ forecast: 4000, archive: 4000, airQuality: 4000 }, 5000)).toBeNull()
    expect(spendOver(forecastHost(5000), 5000)).toBeNull()
    expect(spendOver(forecastHost(4999.2), 5000)).toBeNull()
    // Binary fractions do not move a whole call.
    expect(spendOver(forecastHost(3 * 1.6 + 3 + 3 + 2 * 1.6), 13)).toEqual({ needed: 14, limit: 13 })
    expect(spendOver(forecastHost(3125 * 1.6), 5000)).toBeNull()
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

  it("holds a field whose forecast host's calls are past the hourly budget", () => {
    expect(veto()).toEqual({ needed: 5200, limit: 5000 })
  })

  it('passes a field inside it on every host', () => {
    expect(veto({ known: 1900 })).toBeNull()
  })

  it('is off with no count, no window, or a count over the cap, which has its own line', () => {
    expect(veto({ known: null })).toBeNull()
    expect(veto({ selection: { kind: 'days', startDate: null, endDate: null } })).toBeNull()
    expect(veto({ known: 2600 })).toBeNull()
  })
})
