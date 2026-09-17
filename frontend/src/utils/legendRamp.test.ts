import { describe, expect, it } from 'vitest'
import { METRIC_SCALE, hourlyScale } from './colors'
import { metricLabel } from '../metrics'
import { SNOW_RAMP, snowRampCss, snowTicks } from './snowDepth'
import { rampCss, rampTicks, scaleRampCss, scaleTicks } from './legendRamp'

// The strip every banded scale on the map is drawn as (#454): the five ranking
// metrics and the snow depth overlay.
describe('rampCss', () => {
  it('gives every band an equal share of the strip', () => {
    // Never to scale: snow runs 0.39 to 787 inches in eleven steps and
    // precipitation 0.01 to 1.00 in five, so a strip drawn to scale would be
    // most of its bands in the first few pixels.
    const css = rampCss(['#a', '#b', '#c', '#d'], false)
    expect(css).toBe('linear-gradient(90deg,#a 0%,#a 25%,#b 25%,#b 50%,#c 50%,#c 75%,#d 75%,#d 100%)')
  })

  // Hard stops for a classification, a blend for an interpolation — the strip
  // follows what the map draws rather than what looks better.
  it('blends from anchor to anchor, with the first band flat', () => {
    // `interpolateRgb` in `colors.ts` gives everything at or below the first
    // threshold the first anchor, so band 0 carries no gradient; each later
    // band runs from one anchor to the next.
    expect(rampCss(['#a', '#b', '#c', '#d'], true)).toBe(
      'linear-gradient(90deg,#a 0%,#a 25%,#b 50%,#c 75%,#d 100%)',
    )
  })

  it('keeps the snow strip hard-stopped and a metric strip blended', () => {
    expect(snowRampCss()).toContain(`${SNOW_RAMP[1].color} ${(1 / SNOW_RAMP.length) * 100}%`)
    // A blended strip names each colour once past the first; a hard-stopped one
    // names every colour twice.
    const blended = scaleRampCss(METRIC_SCALE.wind)
    for (const color of METRIC_SCALE.wind.colors.slice(1)) {
      expect(blended.split(color).length - 1).toBe(1)
    }
  })
})

describe('rampTicks', () => {
  // Every section on the map states its unit on its own label — `Wind (mph)`,
  // `Snow depth (in)` — so a tick is the number and nothing else (TJ,
  // 2026-09-17). A unit here would be the second spelling on one key, and the
  // strip has no room for three more characters on its widest label.
  it('carries the number and no unit', () => {
    const ticks = rampTicks([
      { at: 1, text: '5' },
      { at: 3, text: '25' },
      { at: 5, text: '50' },
    ])
    expect(ticks.map((t) => t.label)).toEqual(['5', '25', '50'])
  })

  // Each label hangs from the nearest edge that keeps it inside the box: the
  // last from the strip's right edge, a tick on the left edge from that, and
  // everything between centred on its own boundary.
  it('hangs each label where it fits', () => {
    const ticks = rampTicks([
      { at: 0, text: '0' },
      { at: 3, text: '4' },
      { at: 6, text: '40' },
      { at: 10, text: '400' },
    ])
    expect(ticks.map((t) => t.align)).toEqual(['start', 'center', 'center', 'end'])
  })
})

describe('scaleTicks', () => {
  // Three of five, because five collide: at the 10px step the row is set in,
  // the freezing level's boundaries measure 28 to 33px each and land 27px
  // apart (Chrome, 2026-09-17).
  it('prints the bottom, the middle and the top boundary', () => {
    for (const scale of Object.values(METRIC_SCALE)) {
      const ticks = scaleTicks(scale)
      expect(ticks).toHaveLength(3)
      expect(ticks.map((t) => t.at)).toEqual([1, 3, 5])
    }
  })

  // The numbers ARE the thresholds, formatted — a tick that restated one could
  // disagree with it, which is what the hand-written band captions did until
  // #454.
  it('reads every tick back as the threshold it names', () => {
    for (const scale of Object.values(METRIC_SCALE)) {
      const read = scaleTicks(scale).map((t) => Number(t.label.replace(/,/g, '').match(/[\d.]+/)![0]))
      expect(read).toEqual([scale.thresholds[0], scale.thresholds[2], scale.thresholds[4]])
    }
  })

  // One decimal count for the whole scale, taken from its finest threshold: a
  // row reading `0.01 0.25 1.00` is one scale where `0.01 0.25 1` is three
  // unrelated numbers.
  it('prints one scale to one precision, and groups its thousands', () => {
    expect(scaleTicks(METRIC_SCALE.precip).map((t) => t.label)).toEqual(['0.01', '0.25', '1.00'])
    expect(scaleTicks(METRIC_SCALE.freeze).map((t) => t.label)).toEqual([
      '4,000',
      '12,000',
      '20,000',
    ])
    expect(scaleTicks(METRIC_SCALE.wind).map((t) => t.label)).toEqual(['5', '25', '50'])
  })

  // The unit is the section LABEL's, not the strip's: `metricLabel` composes it
  // from the same scale, so a strip cannot be labelled in one unit and ticked
  // in another.
  it('leaves every metric tick bare, unit and all', () => {
    for (const scale of Object.values(METRIC_SCALE)) {
      for (const tick of scaleTicks(scale)) {
        expect(tick.label).toMatch(/^[\d,.]+$/)
      }
    }
  })

  // Playback swaps the window-total scale for the hourly rate one, and the
  // strip has to follow it: 0.30 in over three days is drizzle and 0.30 in/hr
  // is a downpour.
  it('follows the hourly scale, bands and label alike', () => {
    const rate = hourlyScale('precip_total_in')!
    expect(scaleTicks(rate).map((t) => t.label)).toEqual(['0.01', '0.30', '1.00'])
    // The swap shows in the label rather than on the strip: `in/hr` against the
    // window scale's `in` is the whole point of the second scale existing.
    expect(metricLabel('precip', undefined, rate.unit)).toBe('Precipitation (in/hr)')
    expect(metricLabel('precip', undefined, METRIC_SCALE.precip.unit)).toBe('Precipitation (in)')
  })
})

// The snow strip reads the same two builders, so the two keys on the map cannot
// be drawn to different rules.
describe('the snow strip', () => {
  it('names four of its eleven boundaries, bare', () => {
    const ticks = snowTicks()
    expect(ticks.map((t) => t.label)).toEqual(['0', '4', '40', '400'])
    expect(ticks.map((t) => t.at)).toEqual([0, 2, 5, 10])
  })
})
