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
    // most of its bands in the first few pixels. Each anchor therefore lands
    // on an equal boundary: 25%, 50%, 75%, 100% for four bands.
    expect(rampCss(['#a', '#b', '#c', '#d'])).toBe(
      'linear-gradient(90deg,#a 0%,#a 25%,#b 50%,#c 75%,#d 100%)',
    )
  })

  // The ramp mirrors `interpolateRgb` in `colors.ts`, which gives everything at
  // or below the first threshold the first anchor: band 0 carries no gradient,
  // and each later band runs from one anchor to the next.
  it('holds the first band flat and blends from anchor to anchor after it', () => {
    const css = rampCss(['#a', '#b', '#c', '#d'])
    expect(css).toContain('#a 0%,#a 25%')
    expect(css.split('#b').length - 1).toBe(1)
  })

  // One drawing for every scale on the map (TJ, 2026-09-22). The snow strip was
  // the one exception until #460, and a legend box holding a strip of blocks
  // beside a strip of gradient read as two systems.
  it('draws the snow strip and a metric strip the same way', () => {
    for (const css of [snowRampCss(), scaleRampCss(METRIC_SCALE.wind)]) {
      const colors = css.match(/#[0-9a-f]{6}/g)!
      // Every colour once, except the first, which is named twice to hold
      // band 0 flat. A hard-stopped strip named every colour twice.
      expect(colors.filter((c) => c === colors[0])).toHaveLength(2)
      expect(new Set(colors).size).toBe(colors.length - 1)
    }
    // And the snow strip's second anchor sits on its own boundary rather than
    // at the start of a block.
    expect(snowRampCss()).toContain(`${SNOW_RAMP[1].color} ${(2 / SNOW_RAMP.length) * 100}%`)
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

  // Every label is centred on its boundary except the last, which hangs from
  // the strip's right edge because it is wider than a band.
  it('hangs each label where it fits', () => {
    const ticks = rampTicks([
      { at: 1, text: '0' },
      { at: 3, text: '4' },
      { at: 6, text: '40' },
      { at: 10, text: '400' },
    ])
    expect(ticks.map((t) => t.align)).toEqual(['center', 'center', 'center', 'end'])
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
    // Band `i`'s anchor is at boundary `i + 1` on a blended strip, and the top
    // tick's `end` alignment adds that one itself (#460).
    expect(ticks.map((t) => t.at)).toEqual([1, 3, 6, 10])
  })
})
