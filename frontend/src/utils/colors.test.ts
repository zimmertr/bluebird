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
import { scaleTicks } from './legendRamp'
import { LabelledScale } from './colors'
import { FAMILY_KEYS, RANKED_FAMILIES, RANKING_KEYS, familyOf } from '../metrics'

/** What the map's strip prints under a scale, in order. */
const labelsOf = (scale: LabelledScale) => scaleTicks(scale).map((tick) => tick.label)

// Every column that carries a color: each colored family's own key list, which
// is where the color table gets them from too.
const COLORED_KEYS: string[] = (Object.keys(METRIC_SCALE) as ColoredFamily[]).flatMap(
  (family) => [...FAMILY_KEYS[family]],
)

// The two precipitation scales' boundaries, spelled once here because several
// tests below pin them: the window total (inches over the window) and the
// rainfall rate (inches per hour) are different quantities on different
// boundaries, and both ramps changed in #445.
const TOTAL_THRESHOLDS = [0.01, 0.1, 0.25, 0.5, 1]
const RATE_THRESHOLDS = [0.01, 0.1, 0.3, 0.5, 1]

// Anchor hexes, lowest (green) → highest. Precipitation and wind top out at
// purple (#445); the AQI scale continues through the EPA Very Unhealthy /
// Hazardous bands, and its Very Unhealthy purple is the same one.
const GREEN = '#22c55e'
const LIME = '#84cc16'
const YELLOW = '#eab308'
const ORANGE = '#f97316'
const RED = '#ef4444'
const PURPLE = '#a855f7'
const MAROON = '#991b1b'
// The temperature ramp's cold half (#445): the same purple the freezing level
// starts on, then sky and cyan. GREEN sits in its middle and ORANGE and RED
// above are its warm half.
const COLD_PURPLE = '#d8b4fe'
const SKY = '#38bdf8'
const CYAN = '#67e8f9'

describe('markerColor', () => {
  it('returns the first anchor at or below the first threshold', () => {
    expect(markerColor(0, 'precip_total_in')).toBe(GREEN)
    expect(markerColor(0.01, 'precip_total_in')).toBe(GREEN)
    // Values below the scale clamp to the first anchor rather than going out
    // of range — for temperature that is the cold purple, not green.
    expect(markerColor(-5, 'temp_avg_f')).toBe(COLD_PURPLE)
    expect(markerColor(30, 'temp_avg_f')).toBe(COLD_PURPLE)
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
    // precip thresholds [0.01, 0.10, 0.25, 0.50, 1.00]; last segment width is
    // 0.50, so 1.00 + 0.50 = 1.50 reaches purple, and anything higher stays
    // clamped.
    expect(markerColor(1.0, 'precip_total_in')).toBe(RED)
    expect(markerColor(1.5, 'precip_total_in')).toBe(PURPLE)
    expect(markerColor(10, 'precip_total_in')).toBe(PURPLE)
    // AQI extrapolates purple → maroon above 300 (full maroon by 400).
    expect(markerColor(400, 'aqi_avg')).toBe(MAROON)
    expect(markerColor(999, 'aqi_avg')).toBe(MAROON)
  })

  // Six anchors, green through red to purple (#445). Red is a band now rather
  // than the end of the ramp: 35 to 50 mph is red, and the purple past 50 is
  // where the old scale had stopped telling a 40 mph ridge from a 60 mph one.
  it('keeps precipitation and wind on the six-anchor green→purple ramp', () => {
    expect(markerColor(35, 'wind_avg_mph')).toBe(ORANGE)
    expect(markerColor(50, 'wind_avg_mph')).toBe(RED)
    // One last-band width (15 mph) past 50 is full purple, then clamped.
    expect(markerColor(65, 'wind_avg_mph')).toBe(PURPLE)
    expect(markerColor(100, 'wind_avg_mph')).toBe(PURPLE)
    expect(markerColor(1.0, 'precip_max_in_hr')).toBe(RED)
    expect(markerColor(1.5, 'precip_max_in_hr')).toBe(PURPLE)
  })

  // The temperature ramp is cold-to-hot with green in the MIDDLE (#445): the
  // old scale painted 30°F green, which called the rain-to-snow band the best
  // condition on the map. Purple is cold, the same purple the freezing level
  // starts on; green is reached at 75 so 70 reads green (TJ, 2026-09-16); and
  // the warm half is the shared ramp's orange and red.
  it('reads temperature cold to hot, purple through green to red', () => {
    expect(markerColor(30, 'temp_avg_f')).toBe(COLD_PURPLE)
    expect(markerColor(45, 'temp_avg_f')).toBe(SKY)
    expect(markerColor(60, 'temp_avg_f')).toBe(CYAN)
    expect(markerColor(75, 'temp_avg_f')).toBe(GREEN)
    expect(markerColor(90, 'temp_avg_f')).toBe(ORANGE)
    expect(markerColor(105, 'temp_avg_f')).toBe(RED)
    expect(markerColor(130, 'temp_avg_f')).toBe(RED)
    // The cold end is never green: 32°F is deep in the purple-to-sky band.
    expect(markerColor(32, 'temp_avg_f')).not.toBe(GREEN)
    expect(METRIC_SCALE.temp.colors).not.toContain(LIME)
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
    expect(scaleFor('precip_avg_in_hr', false)?.thresholds).toEqual(RATE_THRESHOLDS)
    expect(scaleFor('precip_min_in_hr', false)?.thresholds).toEqual(RATE_THRESHOLDS)
    expect(scaleFor('precip_max_in_hr', false)?.thresholds).toEqual(RATE_THRESHOLDS)
    // The window total keeps its own, which is what the map legend advertises.
    expect(scaleFor('precip_total_in', false)?.thresholds).toEqual(TOTAL_THRESHOLDS)
  })

  // The 0.10 / 0.30 / 0.50 boundaries are the National Weather Service's, so a
  // reader can look up what a boundary means; the purple top past 1.00 in/hr
  // is this app's own (#445). A split of the light class at 0.05 was built
  // and reverted (TJ, 2026-09-16, deferring to the NWS). The pinning is the
  // point: these are a judgement about weather, like the ramps above, and
  // moving one should be a deliberate edit rather than a side effect.
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
    expect(Object.keys(METRIC_SCALE).sort()).toEqual([
      'aqi',
      'freeze',
      'precip',
      'snow',
      'temp',
      'wind',
    ])
  })

  it('keeps thresholds strictly ascending with labels and colors aligned', () => {
    for (const cfg of Object.values(METRIC_SCALE)) {
      for (let i = 1; i < cfg.thresholds.length; i++) {
        expect(cfg.thresholds[i - 1]).toBeLessThan(cfg.thresholds[i])
      }
      // One band per color; boundaries sit between adjacent colors, and the
      // legend prints every other boundary (#454), which on six bands is the
      // bottom, the middle and the top.
      expect(scaleTicks(cfg)).toHaveLength(3)
      expect(cfg.thresholds).toHaveLength(cfg.colors.length - 1)
    }
  })

  // Six bands on every scale, which is the count `scaleTicks` reads the map
  // legend's three tick positions off. A seventh anywhere moves those, so this
  // fails first.
  it('gives every scale six bands', () => {
    for (const cfg of Object.values(METRIC_SCALE)) {
      expect(cfg.colors).toHaveLength(6)
    }
    expect(METRIC_SCALE.aqi.thresholds).toEqual([50, 100, 150, 200, 300])
    // The one scale with no unit at all, so the map legend labels it with the
    // bare noun where every other scale reads `Temperature (°F)`.
    expect(METRIC_SCALE.aqi.unit).toBe('')
  })

  it('pins every ramp to the boundaries it was tuned to', () => {
    // Only the AQI row was spelled out above, so moving a weather threshold
    // passed the whole suite. These are the switching points behind every
    // marker color on the map; they are a judgement about conditions, not an
    // implementation detail, so a change should be a deliberate edit here.
    expect(METRIC_SCALE.precip.thresholds).toEqual(TOTAL_THRESHOLDS)
    expect(METRIC_SCALE.wind.thresholds).toEqual([5, 15, 25, 35, 50])
    expect(METRIC_SCALE.temp.thresholds).toEqual([30, 45, 60, 75, 90])
    expect(METRIC_SCALE.freeze.thresholds).toEqual([4000, 8000, 12000, 16000, 20000])
  })

  // Precipitation and wind share one ramp, and its top is the purple AQI's
  // Very Unhealthy band already wears, so purple says the same thing wherever
  // a reader meets it: past the end of the ramp.
  it('ends precipitation and wind in the purple AQI already uses', () => {
    expect(METRIC_SCALE.precip.colors).toEqual([GREEN, LIME, YELLOW, ORANGE, RED, PURPLE])
    expect(METRIC_SCALE.wind.colors).toEqual(METRIC_SCALE.precip.colors)
    expect(METRIC_SCALE.aqi.colors[4]).toBe(PURPLE)
  })

  // What the map's strip prints under each of the three scales #445 moved, and
  // under the rate scale playback swaps in. The numbers are derived from the
  // thresholds rather than written beside them (#454), so these fix the
  // FORMATTING — how many decimals, where the separators go, which tick wears
  // the unit — and the boundaries are checked against the ramp below.
  it('prints the moved scales as the boundaries they switch on', () => {
    expect(labelsOf(METRIC_SCALE.temp)).toEqual(['30', '60', '90'])
    expect(labelsOf(METRIC_SCALE.wind)).toEqual(['5', '25', '50'])
    expect(labelsOf(METRIC_SCALE.precip)).toEqual(['0.01', '0.25', '1.00'])
    expect(labelsOf(hourlyScale('precip_total_in')!)).toEqual(['0.01', '0.30', '1.00'])
  })

  it('advertises the same boundaries in the legend that it switches on', () => {
    // The strip's numbers ARE the thresholds, formatted — so this reads them
    // back out and checks they still say what the ramp switches on. It was a
    // drift check over hand-written captions until #454 derived them; it stays
    // because the formatting could still round a boundary into a different
    // number.
    for (const cfg of Object.values(METRIC_SCALE)) {
      // Thousands separators come out first: the freezing level groups its
      // digits the way every other number this app prints does, and "4,000"
      // would otherwise read back as two boundaries.
      const advertised = labelsOf(cfg).map((label) =>
        Number(label.replace(/,/g, '').match(/\d+(?:\.\d+)?/)?.[0]),
      )
      expect(advertised).toEqual([cfg.thresholds[0], cfg.thresholds[2], cfg.thresholds[4]])
    }
  })
})

describe('rankedScale', () => {
  // Markers and the metric legend read the ranked value on this scale (#291).
  it('resolves every rankable key, since every family carries a scale', () => {
    for (const key of RANKING_KEYS) {
      const scale = rankedScale(key)
      expect(scale, `${key} has no ranked scale`).not.toBeNull()
      expect(scaleTicks(scale!).length).toBeGreaterThan(0)
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
      expect(rankedScale(key)!.thresholds).toEqual(RATE_THRESHOLDS)
    }
    expect(rankedScale('precip_total_in')!.thresholds).toEqual(TOTAL_THRESHOLDS)
  })

  it('shares one family scale across a family’s aggregates', () => {
    expect(rankedScale('wind_min_mph')).toBe(rankedScale('wind_max_mph'))
    expect(rankedScale('temp_min_f')).toBe(rankedScale('temp_avg_f'))
    expect(rankedScale('aqi_max')).toBe(rankedScale('aqi_avg'))
  })

  it('is the scale markerColor actually interpolates on', () => {
    // 0.3 in/hr sits at the rate scale's third boundary (yellow) and inside
    // the window scale's fourth band — same number, different quantity, and
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
      expect(hourlyScale(key)!.thresholds).toEqual(RATE_THRESHOLDS)
    }
  })

  it('moves the window total off its scale onto the rainfall-rate one', () => {
    const rate = hourlyScale('precip_total_in')!
    expect(rate.thresholds).not.toEqual(METRIC_SCALE.precip.thresholds)
    // The National Weather Service's own intensity classes at 0.10, 0.30 and
    // 0.50, borrowed rather than invented so a reader can look them up, with
    // the app's own purple top past 1.00 (#445).
    expect(rate.thresholds).toEqual(RATE_THRESHOLDS)
  })

  it('captions the rate scale in its own unit', () => {
    // The legend shows one scale or the other with nothing beside it to
    // compare against, so the unit is the only thing saying which reading it
    // is on. It rides the section's LABEL, which is where every other surface
    // in the app puts a unit too.
    expect(hourlyScale('precip_total_in')!.unit).toBe('in/hr')
    expect(METRIC_SCALE.precip.unit).toBe('in')
  })

  it('advertises the boundaries the rate scale actually switches on', () => {
    const cfg = hourlyScale('precip_total_in')!
    const advertised = labelsOf(cfg).map((label) =>
      Number(label.match(/\d+(?:\.\d+)?/)?.[0]),
    )
    expect(advertised).toEqual([cfg.thresholds[0], cfg.thresholds[2], cfg.thresholds[4]])
  })

  it('prints three of its five boundaries, which is what fits', () => {
    expect(scaleTicks(hourlyScale('precip_total_in')!)).toHaveLength(3)
  })
})

describe('the freezing-level ramp', () => {
  // What the map's strip prints, which is the one scale whose numbers need
  // grouping: 20000 unseparated would be the only four- and five-digit figures
  // in the app not formatted the way the table formats them.
  it('prints each boundary at the height it switches on', () => {
    expect(labelsOf(METRIC_SCALE.freeze)).toEqual(['4,000', '12,000', '20,000'])
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

describe('the temperature ramp', () => {
  // Measured 2026-09-16 and pinned the way the freezing level's table above is:
  // recomputed from the constants, so a shade that moves fails here and forces
  // a re-measurement. Same three readings, same surfaces.
  //
  // The cold half is drawn from the 300/400 shades so it clears 4.5:1 as cell
  // text, which is the reason it is not a deeper blue. The green and the warm
  // half are the shared ramp's own, and green, orange and red miss 4.5:1 in a
  // cell (4.46, 3.94, 3.23) on every scale that carries them — a pre-existing
  // state recorded on #445 rather than one this ramp introduced, and the price
  // of one green and one red meaning one thing across the table.
  // The floor this table holds is therefore the LEGEND's: every swatch clears
  // 4.5:1 on the box it sits on, except red at 3.88, which also predates this
  // ramp and holds the 3:1 a non-text mark owes (1.4.11).
  const SLATE_800 = '#1d293d'
  const MEASURED = [
    { color: '#d8b4fe', cellText: 5.24, markerRing: 1.77, legendSwatch: 8.27 },
    { color: '#38bdf8', cellText: 4.57, markerRing: 2.14, legendSwatch: 6.82 },
    { color: '#67e8f9', cellText: 6.02, markerRing: 1.45, legendSwatch: 10.08 },
    { color: '#22c55e', cellText: 4.46, markerRing: 2.28, legendSwatch: 6.41 },
    { color: '#f97316', cellText: 3.94, markerRing: 2.8, legendSwatch: 5.21 },
    { color: '#ef4444', cellText: 3.23, markerRing: 3.76, legendSwatch: 3.88 },
  ]

  it('still measures what the comment above says it measures', () => {
    expect(MEASURED.map((m) => m.color)).toEqual(METRIC_SCALE.temp.colors)
    for (const m of MEASURED) {
      const tinted = mixOver(m.color, SLATE_800, 0.2)
      expect(round2(contrast(m.color, tinted)), `${m.color} cell text`).toBe(m.cellText)
      expect(round2(contrast(m.color, '#ffffff')), `${m.color} marker ring`).toBe(m.markerRing)
      expect(round2(contrast(m.color, SLATE_800)), `${m.color} legend swatch`).toBe(m.legendSwatch)
    }
  })

  // The cold half is the half this ramp chose, and it clears the cell floor.
  it('clears 4.5:1 for the number printed in a cold cell', () => {
    for (const m of MEASURED.slice(0, 3)) {
      expect(m.cellText, `${m.color} cell text`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps every legend swatch clear of the box it sits on', () => {
    for (const m of MEASURED) {
      expect(m.legendSwatch, `${m.color} swatch`).toBeGreaterThanOrEqual(3)
    }
  })

  // The cold half shares no hue with the other ramps, so cold can never be
  // mistaken for their good end; the green is THEIR green, in the middle; and
  // the warm half IS their bad end, so hot reads as every other scale's bad
  // end.
  it('borrows the shared ramp for its green and warm half and none of it for the cold half', () => {
    const shared = METRIC_SCALE.wind.colors
    expect(METRIC_SCALE.temp.colors[3]).toBe(shared[0])
    expect(METRIC_SCALE.temp.colors.slice(4)).toEqual(shared.slice(3, 5))
    for (const cold of METRIC_SCALE.temp.colors.slice(0, 3)) {
      expect(shared).not.toContain(cold)
    }
    // Purple is cold on both scales that encode a quantity rather than a verdict.
    expect(METRIC_SCALE.temp.colors[0]).toBe(METRIC_SCALE.freeze.colors[0])
  })
})

describe('the snow depth ramp', () => {
  // One family of blues seen from the other end: the freezing level runs
  // purple at the bottom to cyan at the top, and this runs cyan at the bottom
  // to purple at the top. Both encode a quantity rather than a verdict, which
  // is why neither has a red end, and sharing the six shades is what makes
  // them read as one system (TJ, 2026-09-22).
  it('is the freezing level\'s six shades, the other way round', () => {
    expect(METRIC_SCALE.snow.colors).toEqual([...METRIC_SCALE.freeze.colors].reverse())
  })

  // The boundaries are the snow LAYER's own tick numbers plus one at 20, so a
  // marker and the raster under it band on the same depths, and the strip's
  // three printed numbers land on a foot, a season's pack and the year-round
  // ice a glaciated summit reads.
  it('bands on the layer\'s numbers and prints three of them', () => {
    expect(METRIC_SCALE.snow.thresholds).toEqual([1, 4, 20, 40, 400])
    expect(labelsOf(METRIC_SCALE.snow)).toEqual(['1', '20', '400'])
    expect(METRIC_SCALE.snow.unit).toBe('in')
  })

  it('hits each anchor exactly at its threshold boundary', () => {
    const [b0, b1, b2, b3, b4, b5] = METRIC_SCALE.snow.colors
    // Bare ground and everything at or below the first boundary.
    expect(markerColor(0, 'snow_depth_in')).toBe(b0)
    expect(markerColor(1, 'snow_depth_in')).toBe(b0)
    expect(markerColor(4, 'snow_depth_in')).toBe(b1)
    expect(markerColor(20, 'snow_depth_in')).toBe(b2)
    expect(markerColor(40, 'snow_depth_in')).toBe(b3)
    expect(markerColor(400, 'snow_depth_in')).toBe(b4)
    // One more band of extrapolation past the last threshold, then clamped —
    // which is where a summit reading over a thousand inches of glacier ice
    // lands (Mount Rainier measured 1,290 in on 2026-09-22).
    expect(markerColor(760, 'snow_depth_in')).toBe(b5)
    expect(markerColor(1290, 'snow_depth_in')).toBe(b5)
  })

  // Measured 2026-09-22 and pinned the way the freezing level's table is:
  // recomputed from the constants, so a shade that moves fails here and forces
  // a re-measurement. Same three surfaces, and the same numbers in reverse,
  // because these are the same six shades.
  const SLATE_800 = '#1d293d'
  const MEASURED = [
    { color: '#67e8f9', cellText: 6.02, markerRing: 1.45, legendSwatch: 10.08 },
    { color: '#38bdf8', cellText: 4.57, markerRing: 2.14, legendSwatch: 6.82 },
    { color: '#93c5fd', cellText: 5.16, markerRing: 1.80, legendSwatch: 8.11 },
    { color: '#a5b4fc', cellText: 4.79, markerRing: 1.99, legendSwatch: 7.33 },
    { color: '#c4b5fd', cellText: 5.09, markerRing: 1.85, legendSwatch: 7.92 },
    { color: '#d8b4fe', cellText: 5.24, markerRing: 1.77, legendSwatch: 8.27 },
  ]

  it('still measures what the comment above says it measures', () => {
    expect(MEASURED.map((m) => m.color)).toEqual(METRIC_SCALE.snow.colors)
    for (const m of MEASURED) {
      const tinted = mixOver(m.color, SLATE_800, 0.2)
      expect(round2(contrast(m.color, tinted)), `${m.color} cell text`).toBe(m.cellText)
      expect(round2(contrast(m.color, '#ffffff')), `${m.color} marker ring`).toBe(m.markerRing)
      expect(round2(contrast(m.color, SLATE_800)), `${m.color} legend swatch`).toBe(m.legendSwatch)
    }
  })

  it('clears 4.5:1 for the number printed in a shaded cell, at every band', () => {
    for (const m of MEASURED) {
      expect(m.cellText, `${m.color} cell text`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps every legend swatch well clear of the box it sits on', () => {
    for (const m of MEASURED) {
      expect(m.legendSwatch, `${m.color} swatch`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

// WCAG relative luminance and contrast, used only to keep the measured tables
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
