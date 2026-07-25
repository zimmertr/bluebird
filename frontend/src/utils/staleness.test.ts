import { describe, expect, it } from 'vitest'
import { rankingStale } from './staleness'

describe('rankingStale', () => {
  it('is false with no analysis yet', () => {
    expect(rankingStale(null, 'precip_total_in', false)).toBe(false)
  })

  it('is false while the knobs match the analyzed snapshot', () => {
    expect(rankingStale({ sortBy: 'wind_avg_mph', sortDesc: true }, 'wind_avg_mph', true)).toBe(
      false,
    )
  })

  it('flags a metric change', () => {
    expect(rankingStale({ sortBy: 'precip_total_in', sortDesc: false }, 'aqi_avg', false)).toBe(
      true,
    )
  })

  it('flags a direction change', () => {
    expect(
      rankingStale({ sortBy: 'precip_total_in', sortDesc: false }, 'precip_total_in', true),
    ).toBe(true)
  })
})
