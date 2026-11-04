import { describe, expect, it } from 'vitest'
import { demoReport } from './demoReport'
import { CLOUD_DECK_CEILING_FT } from '../utils/openMeteoAggregate'

const NOW = Date.UTC(2026, 8, 29, 17, 20)

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
    for (const r of universe) expect(r.snowfall_total_in!).toBeLessThanOrEqual(10 * r.precip_total_in! + 1e-9)
  })

  it('carries numbers a reader can tell apart, so the ranking is visible', () => {
    const { universe } = demoReport(NOW)
    expect(new Set(universe.map((r) => r.aqi_max)).size).toBe(universe.length)
    expect(new Set(universe.map((r) => r.precip_total_in)).size).toBeGreaterThan(2)
  })
})
