import { describe, expect, it } from 'vitest'
import { demoReport } from './demoReport'
import { CLOUD_DECK_CEILING_FT, roundHalfEven } from '../utils/openMeteoAggregate'
import type { DestinationResult } from '../types'

const NOW = Date.UTC(2026, 8, 29, 17, 20)

const METRICS = ['precip_in', 'temp_f', 'wind_mph', 'freeze_ft', 'snowfall_in', 'cloud_deck_ft', 'aqi'] as const

function values(row: DestinationResult, key: (typeof METRICS)[number]): number[] {
  return (row.series?.[key] ?? []).map(Number)
}

/** The least, the most, the mean and the sum, each rounded as the app rounds the metric. */
function reduced(v: number[], digits: number) {
  const sum = v.reduce((a, b) => a + b, 0)
  return {
    min: roundHalfEven(Math.min(...v), digits),
    max: roundHalfEven(Math.max(...v), digits),
    avg: roundHalfEven(sum / v.length, digits),
    total: roundHalfEven(sum, digits),
  }
}

describe('the tutorial report', () => {
  it('ranks a few real summits over a window two days out', () => {
    const { universe, response, analyzed } = demoReport(NOW)
    expect(universe.length).toBeGreaterThanOrEqual(4)
    expect(response.results).toBe(universe)
    expect(response.total_queried).toBe(universe.length)
    expect(analyzed.window.startMs).toBeGreaterThan(NOW + 24 * 3_600_000)
    expect(new Date(analyzed.window.startMs).getHours()).toBe(6)
    expect(new Date(analyzed.window.endMs).getHours()).toBe(18)
    expect(response.times?.[0]).toBe(analyzed.window.startMs)
    expect(response.times?.[response.times.length - 1]).toBe(analyzed.window.endMs)
  })

  it('gives every row a series as long as the shared time grid', () => {
    const { universe, response } = demoReport(NOW)
    const n = response.times!.length
    for (const row of universe) {
      expect(row.series?.temp_f).toHaveLength(n)
      expect(row.series?.aqi).toHaveLength(n)
      expect(row.series?.precip_in).toHaveLength(n)
      expect(row.aqi_max).not.toBeNull()
      // No default column reads N/A in the demonstration (TJ, 2026-09-30).
      expect(row.freeze_min_ft).not.toBeNull()
      expect(row.freeze_max_ft).not.toBeNull()
      expect(row.freeze_avg_ft).not.toBeNull()
      expect(row.snowfall_total_in).not.toBeNull()
      expect(row.series?.snowfall_in).toHaveLength(n)
      // Every analysis carries the cloud deck since #683, so the tour does too.
      expect(row.cloud_deck_min_ft).not.toBeNull()
      expect(row.cloud_deck_max_ft).not.toBeNull()
      expect(row.cloud_deck_avg_ft).not.toBeNull()
      expect(row.series?.cloud_deck_ft).toHaveLength(n)
      expect(row.elevation_ft).not.toBeNull()
    }
  })

  // One summit per line colour (#850, record 0228), each its own place, in
  // the order the demonstration ranks them, Mount Baker first: the marker
  // card flies to `universe[0]`.
  it('ranks twenty distinct summits by the least air-quality index, Mount Baker first', () => {
    const { universe, analyzed } = demoReport(NOW)
    expect(universe).toHaveLength(20)
    expect(analyzed.sortBy).toBe('aqi_max')
    expect(analyzed.sortDesc).toBe(false)
    const aqi = universe.map((r) => r.aqi_max!)
    expect(aqi).toEqual([...aqi].sort((a, b) => a - b))
    expect(universe[0].name).toBe('Mount Baker')
    expect(new Set(universe.map((r) => r.name)).size).toBe(20)
    expect(new Set(universe.map((r) => `${r.latitude},${r.longitude}`)).size).toBe(20)
  })

  // A few rows show each mark the table and the popup print.
  it('shows a dry deck, a freezing level under the summit and snowfall on a few rows each', () => {
    const { universe } = demoReport(NOW)
    expect(universe.filter((r) => r.cloud_deck_max_ft === CLOUD_DECK_CEILING_FT).length).toBeGreaterThanOrEqual(2)
    expect(universe.filter((r) => r.freeze_min_ft! < r.elevation_ft!).length).toBeGreaterThanOrEqual(2)
    expect(universe.filter((r) => r.snowfall_total_in! > 0).length).toBeGreaterThanOrEqual(2)
    for (const r of universe) {
      expect(r.snowfall_total_in!).toBeLessThanOrEqual(10 * r.precip_total_in! + 1e-9)
      const rain = values(r, 'precip_in')
      values(r, 'snowfall_in').forEach((snow, h) => expect(snow).toBeLessThanOrEqual(10 * rain[h] + 1e-9))
    }
  })

  it('carries numbers a reader can tell apart, so the ranking is visible', () => {
    const { universe } = demoReport(NOW)
    expect(new Set(universe.map((r) => r.aqi_max)).size).toBe(universe.length)
    expect(new Set(universe.map((r) => r.precip_total_in)).size).toBeGreaterThan(2)
  })

  // The maintainer, 2026-11-04 (#850): "This chart is too boring. Lets use
  // data with more fluctuation." A straight ramp never turns; a day does.
  it('draws every metric as a day that turns rather than a straight line', () => {
    const { universe } = demoReport(NOW)
    for (const key of METRICS) {
      const turns = universe.some((row) => {
        const v = values(row, key)
        const steps = v.slice(1).map((x, i) => x - v[i]).filter((d) => d !== 0)
        return steps.some((d, i) => i > 0 && Math.sign(d) !== Math.sign(steps[i - 1]))
      })
      expect(turns, key).toBe(true)
    }
  })

  it('crosses lines: two summits trade places after 6 AM in the AQI and the temperature', () => {
    const { universe } = demoReport(NOW)
    for (const key of ['aqi', 'temp_f'] as const) {
      const crossed = universe.some((a) =>
        universe.some((b) => {
          const va = values(a, key)
          const vb = values(b, key)
          return va[0] > vb[0] && va.some((x, h) => x < vb[h])
        }),
      )
      expect(crossed, key).toBe(true)
    }
  })

  // The table, the popup and the chart read one day, so a row's numbers are
  // its own series reduced.
  it('reduces every aggregate from the series of its own row, rounded as the app rounds it', () => {
    const { universe } = demoReport(NOW)
    for (const r of universe) {
      const p = reduced(values(r, 'precip_in'), 4)
      expect([r.precip_min_in_hr, r.precip_max_in_hr, r.precip_avg_in_hr, r.precip_total_in]).toEqual([p.min, p.max, p.avg, p.total])
      const t = reduced(values(r, 'temp_f'), 1)
      expect([r.temp_min_f, r.temp_max_f, r.temp_avg_f]).toEqual([t.min, t.max, t.avg])
      const w = reduced(values(r, 'wind_mph'), 1)
      expect([r.wind_min_mph, r.wind_max_mph, r.wind_avg_mph]).toEqual([w.min, w.max, w.avg])
      const a = reduced(values(r, 'aqi'), 0)
      expect([r.aqi_min, r.aqi_max, r.aqi_avg]).toEqual([a.min, a.max, a.avg])
      const f = reduced(values(r, 'freeze_ft'), 0)
      expect([r.freeze_min_ft, r.freeze_max_ft, r.freeze_avg_ft]).toEqual([f.min, f.max, f.avg])
      const sn = reduced(values(r, 'snowfall_in'), 4)
      expect([r.snowfall_min_in_hr, r.snowfall_max_in_hr, r.snowfall_avg_in_hr, r.snowfall_total_in]).toEqual([sn.min, sn.max, sn.avg, sn.total])
      const d = reduced(values(r, 'cloud_deck_ft'), 0)
      expect([r.cloud_deck_min_ft, r.cloud_deck_max_ft, r.cloud_deck_avg_ft]).toEqual([d.min, d.max, d.avg])
    }
  })

  it('draws the same day on every call', () => {
    expect(demoReport(NOW)).toEqual(demoReport(NOW))
  })
})

