import { describe, expect, it } from 'vitest'
import { FORECAST_REUSE_MS, holdForecasts, reusableForecasts, type HeldForecasts } from './forecastReuse'
import { resultRow } from '../testSupport/fixtures'

const MIN = 60 * 1000
const T0 = Date.parse('2026-07-21T00:00:00Z')
const ASKED = { startMs: T0, endMs: T0 + 2 * 3_600_000, model: 'gfs_seamless' }
const HELD: HeldForecasts = { rows: [resultRow()], times: [T0], ...ASKED, fetchedAtMs: T0 }

describe('reusableForecasts', () => {
  it('reuses the same window and model inside fifteen minutes', () => {
    expect(reusableForecasts(HELD, ASKED, T0 + 14 * MIN)).toBe(HELD)
  })

  it('refuses at fifteen minutes exactly, and after', () => {
    expect(FORECAST_REUSE_MS).toBe(15 * MIN)
    expect(reusableForecasts(HELD, ASKED, T0 + 15 * MIN)).toBeNull()
    expect(reusableForecasts(HELD, ASKED, T0 + 16 * MIN)).toBeNull()
  })

  it('refuses another start, end or model', () => {
    expect(reusableForecasts(HELD, { ...ASKED, startMs: T0 + 3_600_000 }, T0)).toBeNull()
    expect(reusableForecasts(HELD, { ...ASKED, endMs: T0 + 3_600_000 }, T0)).toBeNull()
    expect(reusableForecasts(HELD, { ...ASKED, model: 'icon_seamless' }, T0)).toBeNull()
  })

  it('has nothing to reuse before the first analysis', () => {
    expect(reusableForecasts(null, ASKED, T0)).toBeNull()
  })
})

describe('holdForecasts', () => {
  it('starts the clock at this fetch when nothing was reused', () => {
    const held = holdForecasts(null, HELD.rows, HELD.times, ASKED, T0 + 5 * MIN)
    expect(held).toEqual({ ...HELD, fetchedAtMs: T0 + 5 * MIN })
  })

  it('keeps the first fetch clock across a reuse, so a field cannot be kept alive', () => {
    // Re-analyzed at +14 min, reusing the field fetched at T0.
    const second = holdForecasts(HELD, HELD.rows, HELD.times, ASKED, T0 + 14 * MIN)
    expect(second.fetchedAtMs).toBe(T0)
    // Two minutes after that re-analysis, sixteen after the first fetch.
    expect(reusableForecasts(second, ASKED, T0 + 16 * MIN)).toBeNull()
  })
})
