import { describe, it, expect } from 'vitest'
import { markerColor, cellStyle, hourlyScale, scaleFor, METRIC_CONFIG } from './colors'
import { COLUMNS } from './tableColumns'

// Anchor hexes, lowest (green) → highest. Weather scales top out at red; the
// AQI scale continues through the EPA Very Unhealthy / Hazardous bands.
// Derived under #255's constraints — see the RAMP comment in colors.ts and
// the measurement suite at the bottom of this file, which is what makes
// changing one of these a re-measurement rather than a paste.
const GREEN = '#50eb74'
const LIME = '#74b800'
const YELLOW = '#9e7400'
const ORANGE = '#964100'
const RED = '#800408'
const PURPLE = '#470059'
const MAROON = '#260000'

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
    // Green anchor #50eb74 === rgb(80, 235, 116). Green sits above the text
    // floor, so its text is the band color itself, untouched.
    expect(cellStyle(0, METRIC_CONFIG.precip_total_in)).toEqual({
      backgroundColor: 'rgba(80,235,116,0.2)',
      color: 'rgb(80,235,116)',
    })
  })

  it('keeps the true band color in the background while lightening dark text', () => {
    // Red anchor #800408 === rgb(128,4,8): far below the text floor. The
    // tint must stay the real band color — it is what carries the band once
    // the text has been lightened to stay readable.
    const style = cellStyle(10, METRIC_CONFIG.precip_total_in)
    expect(style.backgroundColor).toBe('rgba(128,4,8,0.2)')
    expect(style.color).not.toBe('rgb(128,4,8)')
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

// The measurement behind #255, kept AS the test so a changed hex fails here
// and forces a re-measurement instead of inheriting a stale claim. The
// instrument: WCAG relative luminance, and the Viénot 1999 dichromacy
// simulation (sRGB → linear → Hunt-Pointer-Estevez LMS, collapse the missing
// axis, back through the inverse, quantize to 8-bit like a screen would).
describe('the ramp measured (#255)', () => {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const delin = (c: number) => {
    const v = Math.max(0, Math.min(1, c))
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255)
  }
  const rgb = (hex: string): number[] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

  const RGB2LMS = [
    [0.31399022, 0.63951294, 0.04649755],
    [0.15537241, 0.75789446, 0.08670142],
    [0.01775239, 0.10944209, 0.87256922],
  ]
  const LMS2RGB = [
    [5.47221206, -4.6419601, 0.16963708],
    [-1.1252419, 2.29317094, -0.1678952],
    [0.02980165, -0.19318073, 1.16364789],
  ]
  const mat = (m: number[][], v: number[]) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2])
  type Cond = 'normal' | 'protan' | 'deutan' | 'tritan'
  const simulate = (c: number[], kind: Cond): number[] => {
    if (kind === 'normal') return c
    let [L, M, S] = mat(RGB2LMS, c.map(lin))
    if (kind === 'protan') L = 1.05118294 * M - 0.05116099 * S
    if (kind === 'deutan') M = 0.9513092 * L + 0.04866992 * S
    if (kind === 'tritan') S = -0.86744736 * L + 1.86727089 * M
    return mat(LMS2RGB, [L, M, S]).map(delin)
  }
  const simLum = (hex: string, cond: Cond) => lum(simulate(rgb(hex), cond))
  const CONDS: Cond[] = ['normal', 'protan', 'deutan', 'tritan']

  const shared = METRIC_CONFIG.precip_total_in.colors
  const aqi = METRIC_CONFIG.aqi_avg.colors

  it('pins each anchor to the luminance it was measured at', () => {
    // The recorded measurement. Any color edit lands here first.
    const measured: Array<[string, number]> = [
      ['#50eb74', 0.6238],
      ['#74b800', 0.3799],
      ['#9e7400', 0.1976],
      ['#964100', 0.1026],
      ['#800408', 0.0469],
      ['#470059', 0.0206],
      ['#260000', 0.0041],
    ]
    for (const [hex, expected] of measured) {
      expect(lum(rgb(hex))).toBeCloseTo(expected, 4)
    }
  })

  it('orders lightness one way, down the shared ramp and on through AQI', () => {
    for (const seq of [shared, aqi]) {
      for (let i = 1; i < seq.length; i++) {
        expect(lum(rgb(seq[i]))).toBeLessThan(lum(rgb(seq[i - 1])))
      }
    }
  })

  it('spreads the shared ramp at least 3:1 end to end', () => {
    expect(contrast(lum(rgb(shared[0])), lum(rgb(shared[4])))).toBeGreaterThanOrEqual(3)
  })

  it('keeps every neighboring shared step ≥ 1.5:1 under all four visions', () => {
    for (let i = 1; i < shared.length; i++) {
      for (const cond of CONDS) {
        const ratio = contrast(simLum(shared[i - 1], cond), simLum(shared[i], cond))
        expect(ratio, `${shared[i - 1]}/${shared[i]} under ${cond}`).toBeGreaterThanOrEqual(1.5)
      }
    }
  })

  // Six-plus-two monotonic steps exhaust the luminance range, so the AQI
  // continuation cannot also clear 1.5 (measured minima: red/purple 1.27
  // protan, purple/maroon 1.27 protan). 1.25 is the honest floor; EPA's hue
  // convention still separates these bands for typical vision.
  it('keeps every neighboring AQI step ≥ 1.25:1 under all four visions', () => {
    for (let i = 1; i < aqi.length; i++) {
      for (const cond of CONDS) {
        const ratio = contrast(simLum(aqi[i - 1], cond), simLum(aqi[i], cond))
        expect(ratio, `${aqi[i - 1]}/${aqi[i]} under ${cond}`).toBeGreaterThanOrEqual(1.25)
      }
    }
  })

  it('keeps cell text AA-readable on the darkest and lightest row surfaces', () => {
    // The two surfaces a colored cell can sit on: the panel (slate-800) and
    // a hovered row (slate-700 composited at 30% over it). If the table's
    // surfaces change, TEXT_FLOOR_L in colors.ts must be re-derived.
    const composite = (top: number[], bottom: number[], alpha: number) =>
      top.map((c, i) => alpha * c + (1 - alpha) * bottom[i])
    const surfaces = [
      lum(rgb('#1e293b')),
      lum(composite(rgb('#334155'), rgb('#1e293b'), 0.3)),
    ]
    const anchorValues = (scale: { thresholds: number[] }) => [
      scale.thresholds[0] - 1,
      ...scale.thresholds,
      scale.thresholds[scale.thresholds.length - 1] * 10,
    ]
    for (const cfg of Object.values(METRIC_CONFIG)) {
      for (const value of anchorValues(cfg)) {
        const text = cellStyle(value, cfg).color.match(/\d+/g)!.map(Number)
        for (const surface of surfaces) {
          expect(
            contrast(lum(text), surface),
            `text for ${value} on L=${surface.toFixed(4)}`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
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
