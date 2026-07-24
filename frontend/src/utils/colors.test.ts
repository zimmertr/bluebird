import { describe, it, expect } from 'vitest'
import { markerColor, cellStyle, METRIC_CONFIG, MARKER_COLORS } from './colors'

// Anchor hexes, lowest (green) → highest (red).
const GREEN = '#22c55e'
const LIME = '#84cc16'
const YELLOW = '#eab308'
const ORANGE = '#f97316'
const RED = '#ef4444'

describe('markerColor', () => {
  it('returns green at or below the first threshold', () => {
    expect(markerColor(0, 'precip_total_in')).toBe(GREEN)
    expect(markerColor(0.01, 'precip_total_in')).toBe(GREEN)
    // Values below the scale clamp to green rather than going out of range.
    expect(markerColor(-5, 'temp_avg_f')).toBe(GREEN)
  })

  it('hits each anchor exactly at its threshold boundary (AQI = EPA categories)', () => {
    expect(markerColor(50, 'aqi_avg')).toBe(GREEN)
    expect(markerColor(100, 'aqi_avg')).toBe(LIME)
    expect(markerColor(150, 'aqi_avg')).toBe(YELLOW)
    expect(markerColor(200, 'aqi_avg')).toBe(ORANGE)
  })

  it('extrapolates to full red one segment past the last threshold', () => {
    // precip thresholds [0.01, 0.10, 0.25, 0.50]; last segment width is 0.25,
    // so 0.50 + 0.25 = 0.75 reaches red, and anything higher stays clamped.
    expect(markerColor(0.75, 'precip_total_in')).toBe(RED)
    expect(markerColor(10, 'precip_total_in')).toBe(RED)
    expect(markerColor(250, 'aqi_avg')).toBe(RED)
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

  it('has strictly ascending thresholds and five legend labels per metric', () => {
    for (const cfg of Object.values(METRIC_CONFIG)) {
      const [a, b, c, d] = cfg.thresholds
      expect(a).toBeLessThan(b)
      expect(b).toBeLessThan(c)
      expect(c).toBeLessThan(d)
      expect(cfg.legendLabels).toHaveLength(5)
    }
  })

  it('provides one legend swatch color per band boundary', () => {
    expect(MARKER_COLORS).toHaveLength(5)
  })
})
