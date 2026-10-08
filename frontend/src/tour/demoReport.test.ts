import { describe, expect, it } from 'vitest'
import { demoReport } from './demoReport'

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

  it('carries numbers a reader can tell apart, so the ranking is visible', () => {
    const { universe } = demoReport(NOW)
    expect(new Set(universe.map((r) => r.aqi_max)).size).toBe(universe.length)
    expect(new Set(universe.map((r) => r.precip_total_in)).size).toBeGreaterThan(2)
  })
})
