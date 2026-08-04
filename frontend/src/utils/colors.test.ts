import { describe, it, expect } from 'vitest'
import { markerColor, cellStyle, hourlyScale, scaleFor, METRIC_CONFIG } from './colors'
import { COLUMNS } from './tableColumns'

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
    expect(cellStyle(0, METRIC_CONFIG.precip_total_in)).toEqual({
      backgroundColor: 'rgba(34,197,94,0.2)',
      color: 'rgb(34,197,94)',
    })
  })

  // The regression this signature exists to make impossible: the table used to
  // color every cell in the ranked group by the *ranked* value, so a row came
  // out one flat color and the detail columns' own numbers said nothing. Two
  // numbers on one scale must produce two colors.
  it('colors two different numbers on one scale differently', () => {
    const light = cellStyle(0.02, METRIC_CONFIG.precip_total_in)
    const heavy = cellStyle(0.6, METRIC_CONFIG.precip_total_in)

    expect(light.color).not.toBe(heavy.color)
  })
})

describe('scaleFor', () => {
  // Every column the table can color has to resolve to a scale, or the cell
  // silently falls back to the table's base color and the reader reads a
  // missing signal as a benign one. Derived from the ranking groups rather
  // than a list here, so a column added to a group is covered on arrival.
  it('resolves every column named in a ranked group', () => {
    const grouped = Object.values(METRIC_CONFIG).flatMap((cfg) => cfg.group)

    expect(grouped.length).toBeGreaterThan(0)
    for (const key of grouped) {
      expect(scaleFor(key, false), `${key} has no scale`).not.toBeNull()
      expect(scaleFor(key, true), `${key} has no point-sample scale`).not.toBeNull()
    }
  })

  it('leaves the identity columns uncolored', () => {
    expect(scaleFor('name', false)).toBeNull()
    expect(scaleFor('elevation_ft', false)).toBeNull()
  })

  // The reason a second precipitation scale exists. Inches over a window and
  // inches per hour are different quantities, and 0.30 of one is drizzle where
  // 0.30 of the other is a downpour, so they cannot share a set of boundaries.
  it('scores the per-hour precipitation columns on rainfall intensity', () => {
    expect(scaleFor('precip_avg_in_hr', false)?.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
    expect(scaleFor('precip_max_in_hr', false)?.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
    // The window total keeps its own, which is what the map legend advertises.
    expect(scaleFor('precip_total_in', false)?.thresholds).toEqual([0.01, 0.1, 0.25, 0.5])
  })

  // Boundaries the National Weather Service publishes, not ones tuned here, so
  // a reader can look up what a color means. The pinning is the point: these
  // are a judgement about weather, like the ramps above, and moving one should
  // be a deliberate edit rather than a side effect.
  it('gives the rate scale the same hues and band count as the total scale', () => {
    const rate = scaleFor('precip_avg_in_hr', false)

    expect(rate?.colors).toEqual(METRIC_CONFIG.precip_total_in.colors)
    expect(rate?.thresholds).toHaveLength(rate!.colors.length - 1)
  })

  // A point sample covers one hourly stamp, so "per hour" and "over the
  // window" are the same number, the table collapses them into one column, and
  // the marker beside the row is colored by the window total. Reading the cell
  // on the rate scale there would color a cell one thing and its own marker
  // another over an identical value.
  it('reads a point sample on the window-total scale', () => {
    expect(scaleFor('precip_avg_in_hr', true)).toBe(METRIC_CONFIG.precip_total_in)
    expect(scaleFor('precip_max_in_hr', true)).toBe(METRIC_CONFIG.precip_total_in)
  })

  it('leaves the other metrics on one scale per family either way', () => {
    for (const key of ['wind_min_mph', 'wind_max_mph', 'wind_avg_mph']) {
      expect(scaleFor(key, false)).toBe(METRIC_CONFIG.wind_avg_mph)
      expect(scaleFor(key, true)).toBe(METRIC_CONFIG.wind_avg_mph)
    }
    for (const key of ['temp_min_f', 'temp_max_f', 'temp_avg_f']) {
      expect(scaleFor(key, false)).toBe(METRIC_CONFIG.temp_avg_f)
    }
    for (const key of ['aqi_avg', 'aqi_max']) {
      expect(scaleFor(key, false)).toBe(METRIC_CONFIG.aqi_avg)
    }
  })

  // The groups above are strings; COLUMNS is what the table actually renders.
  // A column renamed on one side and not the other would leave a real cell
  // resolving to null while every assertion here still passed.
  it('names only columns the table has', () => {
    const columns = new Set<string>(COLUMNS.map((c) => c.key as string))

    for (const cfg of Object.values(METRIC_CONFIG)) {
      for (const key of cfg.group) {
        expect(columns.has(key), `${key} is in a group but not in COLUMNS`).toBe(true)
      }
    }
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

  it('pins every ramp to the boundaries it was tuned to', () => {
    // Only the AQI row was spelled out above, so moving a weather threshold
    // passed the whole suite. These are the switching points behind every
    // marker color on the map; they are a judgement about conditions, not an
    // implementation detail, so a change should be a deliberate edit here.
    expect(METRIC_CONFIG.precip_total_in.thresholds).toEqual([0.01, 0.1, 0.25, 0.5])
    expect(METRIC_CONFIG.wind_avg_mph.thresholds).toEqual([5, 15, 25, 35])
    expect(METRIC_CONFIG.temp_avg_f.thresholds).toEqual([30, 45, 55, 65])
  })

  it('advertises the same boundaries in the legend that it switches on', () => {
    // The captions spell the same numbers the ramp uses, so the two can drift:
    // a threshold moved without its label ships a legend that lies about the
    // colors beside it. Reading the numbers back out of the captions is what
    // makes that unmissable.
    for (const cfg of Object.values(METRIC_CONFIG)) {
      const advertised = cfg.legendLabels.flatMap((label) =>
        (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
      )
      // "≤ t0", then one pair per middle band, then "> tLast" — so each
      // boundary is named exactly twice, in order.
      expect(advertised).toEqual(cfg.thresholds.flatMap((t) => [t, t]))
    }
  })
})

describe('hourlyScale', () => {
  // Map playback (#121) colors a marker by one hour of the report rather than
  // by the window the ranking used. Three metrics do not care — they rank by an
  // average of the same quantity the hourly series holds — and precipitation
  // does, because its ranked value is a total and its hourly value is a rate.

  it('leaves the three metrics whose hourly value is the ranked quantity alone', () => {
    for (const key of ['wind_avg_mph', 'temp_avg_f', 'aqi_avg'] as const) {
      expect(hourlyScale(key).thresholds).toEqual(METRIC_CONFIG[key].thresholds)
    }
  })

  it('moves precipitation off the window scale onto the rainfall-rate one', () => {
    const rate = hourlyScale('precip_total_in')
    expect(rate.thresholds).not.toEqual(METRIC_CONFIG.precip_total_in.thresholds)
    // The National Weather Service's own intensity classes, borrowed rather
    // than invented so a reader can look them up.
    expect(rate.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
  })

  it('captions the rate scale in its own unit', () => {
    // The legend shows one scale or the other with nothing beside it to
    // compare against, so the unit is the only thing saying which reading it
    // is on.
    for (const label of hourlyScale('precip_total_in').legendLabels) {
      expect(label).toContain('in/hr')
    }
  })

  it('advertises the boundaries the rate scale actually switches on', () => {
    const cfg = hourlyScale('precip_total_in')
    const advertised = cfg.legendLabels.flatMap((label) =>
      (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
    )
    expect(advertised).toEqual(cfg.thresholds.flatMap((t) => [t, t]))
  })

  it('gives every scale as many captions as colors', () => {
    const scale = hourlyScale('precip_total_in')
    expect(scale.legendLabels).toHaveLength(scale.colors.length)
  })
})
