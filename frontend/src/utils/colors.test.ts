import { describe, it, expect } from 'vitest'
import { markerColor, cellStyle, METRIC_CONFIG } from './colors'

// Anchor hexes, lowest (green) → highest. Weather scales top out at red; the
// AQI scale continues through the EPA Very Unhealthy / Hazardous bands.
const GREEN = '#22c55e'
const LIME = '#84cc16'
const YELLOW = '#eab308'
const ORANGE = '#f97316'
const RED = '#ef4444'
const PURPLE = '#a855f7'
const MAROON = '#991b1b'

describe('markerColor', () => {
  it('returns green at or below the first threshold', () => {
    expect(markerColor(0, 'precip_total_in')).toBe(GREEN)
    expect(markerColor(0.01, 'precip_total_in')).toBe(GREEN)
    // Values below the scale clamp to green rather than going out of range.
    expect(markerColor(-5, 'temp_avg_f')).toBe(GREEN)
  })

  it('hits each anchor exactly at its threshold boundary (AQI = EPA categories)', () => {
    // All six EPA bands: Good / Moderate / Sensitive / Unhealthy /
    // Very Unhealthy / Hazardous.
    expect(markerColor(50, 'aqi_avg')).toBe(GREEN)
    expect(markerColor(100, 'aqi_avg')).toBe(YELLOW)
    expect(markerColor(150, 'aqi_avg')).toBe(ORANGE)
    expect(markerColor(200, 'aqi_avg')).toBe(RED)
    expect(markerColor(300, 'aqi_avg')).toBe(PURPLE)
  })

  it('extrapolates to the final anchor one segment past the last threshold', () => {
    // precip thresholds [0.01, 0.10, 0.25, 0.50]; last segment width is 0.25,
    // so 0.50 + 0.25 = 0.75 reaches red, and anything higher stays clamped.
    expect(markerColor(0.75, 'precip_total_in')).toBe(RED)
    expect(markerColor(10, 'precip_total_in')).toBe(RED)
    // AQI extrapolates purple → maroon above 300 (full maroon by 400).
    expect(markerColor(400, 'aqi_avg')).toBe(MAROON)
    expect(markerColor(999, 'aqi_avg')).toBe(MAROON)
  })

  it('keeps the weather scales on the five-anchor green→red ramp', () => {
    expect(markerColor(35, 'wind_avg_mph')).toBe(ORANGE)
    expect(markerColor(100, 'wind_avg_mph')).toBe(RED)
    expect(markerColor(65, 'temp_avg_f')).toBe(ORANGE)
  })

  it('interpolates between anchors for a mid-band value', () => {
    // Halfway between the green (0.01) and lime (0.10) precip anchors.
    const mid = markerColor(0.055, 'precip_total_in')
    expect(mid).not.toBe(GREEN)
    expect(mid).not.toBe(LIME)
    expect(mid).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('cellStyle', () => {
  it('returns a translucent background and solid text of the same hue', () => {
    // Green anchor #22c55e === rgb(34, 197, 94).
    expect(cellStyle(0, 'precip_total_in')).toEqual({
      backgroundColor: 'rgba(34,197,94,0.2)',
      color: 'rgb(34,197,94)',
    })
  })
})

describe('METRIC_CONFIG', () => {
  it('exposes exactly the four rankable metrics', () => {
    expect(Object.keys(METRIC_CONFIG).sort()).toEqual(
      ['aqi_avg', 'precip_total_in', 'temp_avg_f', 'wind_avg_mph'].sort(),
    )
  })

  it('keeps thresholds strictly ascending with labels and colors aligned', () => {
    for (const cfg of Object.values(METRIC_CONFIG)) {
      for (let i = 1; i < cfg.thresholds.length; i++) {
        expect(cfg.thresholds[i - 1]).toBeLessThan(cfg.thresholds[i])
      }
      // One band per color; boundaries sit between adjacent colors.
      expect(cfg.legendLabels).toHaveLength(cfg.colors.length)
      expect(cfg.thresholds).toHaveLength(cfg.colors.length - 1)
    }
  })

  it('gives AQI all six EPA bands and the weather metrics five', () => {
    expect(METRIC_CONFIG.aqi_avg.colors).toHaveLength(6)
    expect(METRIC_CONFIG.aqi_avg.thresholds).toEqual([50, 100, 150, 200, 300])
    expect(METRIC_CONFIG.precip_total_in.colors).toHaveLength(5)
    expect(METRIC_CONFIG.wind_avg_mph.colors).toHaveLength(5)
    expect(METRIC_CONFIG.temp_avg_f.colors).toHaveLength(5)
    // Every AQI legend row carries its unit.
    for (const label of METRIC_CONFIG.aqi_avg.legendLabels) {
      expect(label).toContain('AQI')
    }
  })
})
