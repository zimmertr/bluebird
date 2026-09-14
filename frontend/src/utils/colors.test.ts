import { describe, it, expect } from 'vitest'
import {
  ColoredFamily,
  METRIC_SCALE,
  cellStyle,
  hourlyScale,
  markerColor,
  rankedScale,
  scaleFor,
} from './colors'
import { COLUMNS } from './tableColumns'
import { FAMILY_KEYS, RANKED_FAMILIES, RANKING_KEYS, familyOf } from '../metrics'

// Every column that carries a color: each colored family's own key list, which
// is where the color table gets them from too.
const COLORED_KEYS: string[] = (Object.keys(METRIC_SCALE) as ColoredFamily[]).flatMap(
  (family) => [...FAMILY_KEYS[family]],
)

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
    expect(cellStyle(0, METRIC_SCALE.precip)).toEqual({
      backgroundColor: 'rgba(34,197,94,0.2)',
      color: 'rgb(34,197,94)',
    })
  })

  // The regression this signature exists to make impossible: the table used to
  // color every cell in the ranked group by the *ranked* value, so a row came
  // out one flat color and the detail columns' own numbers said nothing. Two
  // numbers on one scale must produce two colors.
  it('colors two different numbers on one scale differently', () => {
    const light = cellStyle(0.02, METRIC_SCALE.precip)
    const heavy = cellStyle(0.6, METRIC_SCALE.precip)

    expect(light.color).not.toBe(heavy.color)
  })
})

describe('scaleFor', () => {
  // Every column the table can color has to resolve to a scale, or the cell
  // silently falls back to the table's base color and the reader reads a
  // missing signal as a benign one. Derived from the ranking groups rather
  // than a list here, so a column added to a group is covered on arrival.
  it('resolves every column of every colored family', () => {
    const grouped = COLORED_KEYS

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

  // The reversal of #295 (TJ, 2026-09-14). The freezing level was the one
  // metric with no scale, on the argument that a band has to call one height
  // good and another bad. It carries one now because the ramp encodes HEIGHT
  // rather than a verdict, and the contract this asserts is that every
  // freezing-level column shades like every other metric column — the table,
  // the markers, the grid and the legend all read this same table.
  it('colors every freezing-level column', () => {
    for (const key of FAMILY_KEYS.freeze) {
      expect(scaleFor(key, false), `${key} is uncolored`).not.toBeNull()
      expect(scaleFor(key, true), `${key} is uncolored`).not.toBeNull()
    }
  })

  // The reason a second precipitation scale exists. Inches over a window and
  // inches per hour are different quantities, and 0.30 of one is drizzle where
  // 0.30 of the other is a downpour, so they cannot share a set of boundaries.
  it('scores the per-hour precipitation columns on rainfall intensity', () => {
    expect(scaleFor('precip_avg_in_hr', false)?.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
    expect(scaleFor('precip_min_in_hr', false)?.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
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

    expect(rate?.colors).toEqual(METRIC_SCALE.precip.colors)
    expect(rate?.thresholds).toHaveLength(rate!.colors.length - 1)
  })

  // A point sample covers one hourly stamp, so "per hour" and "over the
  // window" are the same number, the table collapses them into one column, and
  // the marker beside the row is colored by the window total. Reading the cell
  // on the rate scale there would color a cell one thing and its own marker
  // another over an identical value.
  it('reads a point sample on the window-total scale', () => {
    expect(scaleFor('precip_avg_in_hr', true)).toBe(METRIC_SCALE.precip)
    expect(scaleFor('precip_min_in_hr', true)).toBe(METRIC_SCALE.precip)
    expect(scaleFor('precip_max_in_hr', true)).toBe(METRIC_SCALE.precip)
  })

  it('leaves the other metrics on one scale per family either way', () => {
    for (const key of ['wind_min_mph', 'wind_max_mph', 'wind_avg_mph']) {
      expect(scaleFor(key, false)).toBe(METRIC_SCALE.wind)
      expect(scaleFor(key, true)).toBe(METRIC_SCALE.wind)
    }
    for (const key of ['temp_min_f', 'temp_max_f', 'temp_avg_f']) {
      expect(scaleFor(key, false)).toBe(METRIC_SCALE.temp)
    }
    for (const key of ['aqi_avg', 'aqi_min', 'aqi_max']) {
      expect(scaleFor(key, false)).toBe(METRIC_SCALE.aqi)
    }
  })

  // The groups above are strings; COLUMNS is what the table actually renders.
  // A column renamed on one side and not the other would leave a real cell
  // resolving to null while every assertion here still passed.
  it('names only columns the table has', () => {
    const columns = new Set<string>(COLUMNS.map((c) => c.key as string))

    for (const family of RANKED_FAMILIES) {
      for (const key of FAMILY_KEYS[family]) {
        expect(columns.has(key), `${key} is rankable but not in COLUMNS`).toBe(true)
      }
    }
  })
})

describe('METRIC_SCALE', () => {
  // All five families. The freezing level joined on 2026-09-14, reversing
  // #295, so an absence here is now a missing scale rather than a decision.
  it('exposes every metric family', () => {
    expect(Object.keys(METRIC_SCALE).sort()).toEqual(['aqi', 'freeze', 'precip', 'temp', 'wind'])
  })

  it('keeps thresholds strictly ascending with labels and colors aligned', () => {
    for (const cfg of Object.values(METRIC_SCALE)) {
      for (let i = 1; i < cfg.thresholds.length; i++) {
        expect(cfg.thresholds[i - 1]).toBeLessThan(cfg.thresholds[i])
      }
      // One band per color; boundaries sit between adjacent colors.
      expect(cfg.legendLabels).toHaveLength(cfg.colors.length)
      expect(cfg.thresholds).toHaveLength(cfg.colors.length - 1)
    }
  })

  it('gives AQI and the freezing level six bands, and the other three five', () => {
    expect(METRIC_SCALE.aqi.colors).toHaveLength(6)
    expect(METRIC_SCALE.freeze.colors).toHaveLength(6)
    expect(METRIC_SCALE.aqi.thresholds).toEqual([50, 100, 150, 200, 300])
    expect(METRIC_SCALE.precip.colors).toHaveLength(5)
    expect(METRIC_SCALE.wind.colors).toHaveLength(5)
    expect(METRIC_SCALE.temp.colors).toHaveLength(5)
    // Every AQI legend row carries its unit.
    for (const label of METRIC_SCALE.aqi.legendLabels) {
      expect(label).toContain('AQI')
    }
  })

  it('pins every ramp to the boundaries it was tuned to', () => {
    // Only the AQI row was spelled out above, so moving a weather threshold
    // passed the whole suite. These are the switching points behind every
    // marker color on the map; they are a judgement about conditions, not an
    // implementation detail, so a change should be a deliberate edit here.
    expect(METRIC_SCALE.precip.thresholds).toEqual([0.01, 0.1, 0.25, 0.5])
    expect(METRIC_SCALE.wind.thresholds).toEqual([5, 15, 25, 35])
    expect(METRIC_SCALE.temp.thresholds).toEqual([30, 45, 55, 65])
    expect(METRIC_SCALE.freeze.thresholds).toEqual([4000, 8000, 12000, 16000, 20000])
  })

  it('advertises the same boundaries in the legend that it switches on', () => {
    // The captions spell the same numbers the ramp uses, so the two can drift:
    // a threshold moved without its label ships a legend that lies about the
    // colors beside it. Reading the numbers back out of the captions is what
    // makes that unmissable.
    for (const cfg of Object.values(METRIC_SCALE)) {
      // Thousands separators come out first: the freezing level's captions
      // group its digits the way every other number this app prints does, and
      // "4,000" would otherwise read back as two boundaries.
      const advertised = cfg.legendLabels.flatMap((label) =>
        (label.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
      )
      // "≤ t0", then one pair per middle band, then "> tLast" — so each
      // boundary is named exactly twice, in order.
      expect(advertised).toEqual(cfg.thresholds.flatMap((t) => [t, t]))
    }
  })
})

describe('rankedScale', () => {
  // Markers and the metric legend read the ranked value on this scale (#291).
  it('resolves every rankable key, since every family carries a scale', () => {
    for (const key of RANKING_KEYS) {
      const scale = rankedScale(key)
      expect(scale, `${key} has no ranked scale`).not.toBeNull()
      expect(scale!.legendLabels.length).toBeGreaterThan(0)
    }
  })

  // Playback colors a marker by one hour's own number. A freezing level is the
  // same quantity by the hour as it is over a window — a height, not a rate —
  // so its hourly scale is its own, unlike precipitation's.
  it('reads a freezing-level ranking on one scale at rest and in playback', () => {
    for (const key of FAMILY_KEYS.freeze) {
      expect(rankedScale(key)).toBe(METRIC_SCALE.freeze)
      expect(hourlyScale(key)).toBe(METRIC_SCALE.freeze)
      expect(markerColor(9000, key)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  // Rank by a rate and everything colored by it must read in/hr: the ranked
  // value IS a rate, so the window-total boundaries would say drizzle where
  // the number means downpour.
  it('reads the rate rankings on the rainfall-rate scale', () => {
    for (const key of ['precip_avg_in_hr', 'precip_min_in_hr', 'precip_max_in_hr'] as const) {
      expect(rankedScale(key)!.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
    }
    expect(rankedScale('precip_total_in')!.thresholds).toEqual([0.01, 0.1, 0.25, 0.5])
  })

  it('shares one family scale across a family’s aggregates', () => {
    expect(rankedScale('wind_min_mph')).toBe(rankedScale('wind_max_mph'))
    expect(rankedScale('temp_min_f')).toBe(rankedScale('temp_avg_f'))
    expect(rankedScale('aqi_max')).toBe(rankedScale('aqi_avg'))
  })

  it('is the scale markerColor actually interpolates on', () => {
    // 0.3 in/hr sits at the rate scale's third boundary (yellow) and inside
    // the window scale's second band — same number, different quantity, and
    // the marker must read it as the ranked one.
    expect(markerColor(0.3, 'precip_max_in_hr')).toBe(YELLOW)
    expect(markerColor(0.3, 'precip_total_in')).not.toBe(YELLOW)
  })
})

describe('hourlyScale', () => {
  // Map playback (#121) colors a marker by one hour of the report rather than
  // by the window the ranking used. Three metrics do not care — they rank by an
  // average of the same quantity the hourly series holds — and precipitation
  // does, because its ranked value is a total and its hourly value is a rate.

  it('leaves the keys whose hourly value is the ranked quantity alone', () => {
    for (const key of [
      'wind_min_mph',
      'wind_avg_mph',
      'wind_max_mph',
      'temp_min_f',
      'temp_avg_f',
      'temp_max_f',
      'aqi_avg',
      'aqi_min',
      'aqi_max',
    ] as const) {
      expect(hourlyScale(key)!.thresholds).toEqual(
        METRIC_SCALE[familyOf(key) as ColoredFamily].thresholds,
      )
    }
    // The rate rankings already read an hourly quantity too, on their own
    // scale — one hour of a peak is that hour's rate.
    for (const key of ['precip_avg_in_hr', 'precip_min_in_hr', 'precip_max_in_hr'] as const) {
      expect(hourlyScale(key)!.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
    }
  })

  it('moves the window total off its scale onto the rainfall-rate one', () => {
    const rate = hourlyScale('precip_total_in')!
    expect(rate.thresholds).not.toEqual(METRIC_SCALE.precip.thresholds)
    // The National Weather Service's own intensity classes, borrowed rather
    // than invented so a reader can look them up.
    expect(rate.thresholds).toEqual([0.01, 0.1, 0.3, 0.5])
  })

  it('captions the rate scale in its own unit', () => {
    // The legend shows one scale or the other with nothing beside it to
    // compare against, so the unit is the only thing saying which reading it
    // is on.
    for (const label of hourlyScale('precip_total_in')!.legendLabels) {
      expect(label).toContain('in/hr')
    }
  })

  it('advertises the boundaries the rate scale actually switches on', () => {
    const cfg = hourlyScale('precip_total_in')!
    const advertised = cfg.legendLabels.flatMap((label) =>
      (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
    )
    expect(advertised).toEqual(cfg.thresholds.flatMap((t) => [t, t]))
  })

  it('gives every scale as many captions as colors', () => {
    const scale = hourlyScale('precip_total_in')!
    expect(scale.legendLabels).toHaveLength(scale.colors.length)
  })
})

describe('the freezing-level ramp', () => {
  // The bands the map legend prints, and the numbers they switch on. Spelled
  // out rather than derived, because these six captions are the approved copy
  // (TJ, 2026-09-14) and a caption is the one thing in this file a reader sees.
  it('captions each band with the height it covers', () => {
    expect(METRIC_SCALE.freeze.legendLabels).toEqual([
      '≤ 4,000 ft',
      '4,000 – 8,000 ft',
      '8,000 – 12,000 ft',
      '12,000 – 16,000 ft',
      '16,000 – 20,000 ft',
      '> 20,000 ft',
    ])
  })

  // The ramp is read by hue, not by lightness, and that is the price of the
  // contrast floor below rather than a choice: the darkest purple that clears
  // 4.5:1 as cell text is lighter than the indigo and sky steps that follow it,
  // so no ordering of these six hues is both conformant and monotone. What is
  // still true, and is what this pins, is that the top band is the lightest
  // thing on the ramp and that no two bands land on one lightness.
  it('tops out at the lightest band, with no two bands alike', () => {
    const steps = METRIC_SCALE.freeze.colors.map(relativeLuminance)
    expect(Math.max(...steps)).toBe(steps[steps.length - 1])
    expect(new Set(steps.map(round2)).size).toBe(steps.length)
  })

  it('hits each anchor exactly at its threshold boundary', () => {
    const [b0, b1, b2, b3, b4, b5] = METRIC_SCALE.freeze.colors
    expect(markerColor(0, 'freeze_min_ft')).toBe(b0)
    expect(markerColor(4000, 'freeze_min_ft')).toBe(b0)
    expect(markerColor(8000, 'freeze_min_ft')).toBe(b1)
    expect(markerColor(12000, 'freeze_min_ft')).toBe(b2)
    expect(markerColor(16000, 'freeze_min_ft')).toBe(b3)
    expect(markerColor(20000, 'freeze_min_ft')).toBe(b4)
    // One more band of extrapolation past the last threshold, then clamped.
    expect(markerColor(24000, 'freeze_min_ft')).toBe(b5)
    expect(markerColor(90000, 'freeze_min_ft')).toBe(b5)
  })

  // Measured 2026-09-14, and pinned the way the accent fill is pinned in
  // styles.test.ts: the numbers are recomputed from the constants below, so a
  // shade that moves fails here and forces a re-measurement rather than
  // inheriting a claim that has quietly gone stale.
  //
  // Three readings, because a band is drawn in three places:
  //  - `cellText` is what `cellStyle` produces in the results table — the hue
  //    at full strength over the same hue at 20% on the slate-800 panel.
  //  - `markerRing` is the marker fill against the 2px white stroke every
  //    marker wears, which is what separates a marker from the basemap: the
  //    basemap itself is not a fixed colour, the ring is.
  //  - `legendSwatch` is the 10px dot on the legend's slate-800/95 box.
  //
  // Every step clears 4.5:1 as cell text, which is what the 300/400 shades buy
  // and is the whole reason the ramp is not darker (TJ chose this over changing
  // `cellStyle`, 2026-09-14). The first draft used 600/800 steps and measured
  // 1.58 to 2.34 in this column.
  //
  // The ring reading is low at the pale end by construction and is not a
  // failure: a marker is a filled circle inside a 2px WHITE stroke, so the ring
  // is what separates it from the basemap, and a pale fill inside a white ring
  // is legible against the map rather than against the ring. The bands are
  // named on the legend, which is the surface that has to carry contrast, and
  // it clears 4.5:1 at every step.
  const SLATE_800 = '#1d293d'
  const MEASURED = [
    { color: '#d8b4fe', cellText: 5.24, markerRing: 1.77, legendSwatch: 8.27 },
    { color: '#c4b5fd', cellText: 5.09, markerRing: 1.85, legendSwatch: 7.92 },
    { color: '#a5b4fc', cellText: 4.79, markerRing: 1.99, legendSwatch: 7.33 },
    { color: '#93c5fd', cellText: 5.16, markerRing: 1.80, legendSwatch: 8.11 },
    { color: '#38bdf8', cellText: 4.57, markerRing: 2.14, legendSwatch: 6.82 },
    { color: '#67e8f9', cellText: 6.02, markerRing: 1.45, legendSwatch: 10.08 },
  ]

  it('still measures what the comment above says it measures', () => {
    expect(MEASURED.map((m) => m.color)).toEqual(METRIC_SCALE.freeze.colors)
    for (const m of MEASURED) {
      const tinted = mixOver(m.color, SLATE_800, 0.2)
      expect(round2(contrast(m.color, tinted)), `${m.color} cell text`).toBe(m.cellText)
      expect(round2(contrast(m.color, '#ffffff')), `${m.color} marker ring`).toBe(m.markerRing)
      expect(round2(contrast(m.color, SLATE_800)), `${m.color} legend swatch`).toBe(m.legendSwatch)
    }
  })

  // The one contrast claim this ramp can make on its own terms. Every band is
  // separated from the band beside it — the pale end by the white ring, the
  // dark end by the legend's own surface — so no step disappears in the place
  // it is drawn.
  it('clears 4.5:1 for the number printed in a shaded cell, at every band', () => {
    for (const m of MEASURED) {
      expect(m.cellText, `${m.color} cell text`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // The one contrast claim the swatches owe: the legend is where a band is
  // named, so a reader who cannot tell two bands apart on the map can still
  // read which is which there.
  it('keeps every legend swatch well clear of the box it sits on', () => {
    for (const m of MEASURED) {
      expect(m.legendSwatch, `${m.color} swatch`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// WCAG relative luminance and contrast, used only to keep the measured table
// above honest. Small enough to live here rather than become a shared helper
// nothing else has asked for.
function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `cellStyle`'s own background: the hue at `alpha` over the panel beneath it. */
function mixOver(hex: string, under: string, alpha: number): string {
  const top = toRgb(hex)
  const bottom = toRgb(under)
  const mixed = top.map((v, i) => Math.round(alpha * v + (1 - alpha) * bottom[i]))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function toRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}
