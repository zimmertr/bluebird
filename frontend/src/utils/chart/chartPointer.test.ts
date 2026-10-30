import { describe, expect, it } from 'vitest'
import {
  CHART_TITLE_PX,
  PLOT_MARGIN,
  TITLED_PLOT_MARGIN,
  X_AXIS_HEIGHT_PX,
  Y_AXIS_WIDTH_PX,
  fingerReading,
  hourIndexAt,
  plotBand,
  readoutPlace,
} from './chartPointer'
import { TOOLTIP_CHROME_PX, TOOLTIP_MAX_ROWS, TOOLTIP_ROW_PX } from './chartData'

const HOUR = 3_600_000
// Seven hourly stamps, so the band of a 360px box divides into six steps.
const TIMES = Array.from({ length: 7 }, (_, i) => 1_800_000_000_000 + i * HOUR)

describe('plotBand', () => {
  it('is the box less the margins and the two axis strips', () => {
    expect(plotBand(360, 200)).toEqual({
      left: PLOT_MARGIN.left + Y_AXIS_WIDTH_PX,
      top: PLOT_MARGIN.top,
      width: 360 - PLOT_MARGIN.left - Y_AXIS_WIDTH_PX - PLOT_MARGIN.right,
      height: 200 - PLOT_MARGIN.top - PLOT_MARGIN.bottom - X_AXIS_HEIGHT_PX,
    })
  })
})

describe('hourIndexAt', () => {
  // The band of a 360px box runs from 52 to 344, 292px for six hours.
  const band = plotBand(360, 200)
  const step = band.width / 6

  it('a finger at a pixel reads the hour a hover there names', () => {
    for (let i = 0; i < TIMES.length; i++) expect(hourIndexAt(band.left + i * step, 360, TIMES)).toBe(i)
    // Snapped to the nearer stamp either side of a midpoint.
    expect(hourIndexAt(band.left + 2.4 * step, 360, TIMES)).toBe(2)
    expect(hourIndexAt(band.left + 2.6 * step, 360, TIMES)).toBe(3)
  })

  it('reads the nearer end off either side of the band', () => {
    expect(hourIndexAt(0, 360, TIMES)).toBe(0)
    expect(hourIndexAt(360, 360, TIMES)).toBe(TIMES.length - 1)
  })

  it('reads nothing on an empty grid or a box with no band', () => {
    expect(hourIndexAt(100, 360, [])).toBeNull()
    expect(hourIndexAt(10, 40, TIMES)).toBeNull()
  })
})

describe('fingerReading', () => {
  it('reads the hour and the value at the finger, top of the band the axis maximum', () => {
    const band = plotBand(360, 200)
    expect(fingerReading(band.left, band.top, { width: 360, height: 200 }, TIMES, 0, 50)).toEqual({ index: 0, value: 50 })
    const mid = fingerReading(band.left + band.width, band.top + band.height / 2, { width: 360, height: 200 }, TIMES, 0, 50)
    expect(mid).toEqual({ index: 6, value: 25 })
  })

  it('reads nothing from a box too short for a band', () => {
    expect(fingerReading(100, 10, { width: 360, height: 30 }, TIMES, 0, 50)).toBeNull()
  })
})

// A phone's chart wears its picker as a title over the plot (#696), and the
// plot starts under it: a finger reads the same band the plot is drawn in.
describe('a titled plot', () => {
  it('starts the band under the title line, the rest of the margins unchanged', () => {
    expect(TITLED_PLOT_MARGIN).toEqual({ ...PLOT_MARGIN, top: TITLED_PLOT_MARGIN.top })
    expect(TITLED_PLOT_MARGIN.top).toBeGreaterThan(PLOT_MARGIN.top + CHART_TITLE_PX)
    const plain = plotBand(360, 200)
    const titled = plotBand(360, 200, TITLED_PLOT_MARGIN)
    expect(titled.top - plain.top).toBe(TITLED_PLOT_MARGIN.top - PLOT_MARGIN.top)
    expect(plain.height - titled.height).toBe(TITLED_PLOT_MARGIN.top - PLOT_MARGIN.top)
    expect(titled.left).toBe(plain.left)
    expect(titled.width).toBe(plain.width)
  })

  it('reads the axis maximum at the titled band top, not at the plain one', () => {
    const band = plotBand(360, 200, TITLED_PLOT_MARGIN)
    const box = { width: 360, height: 200 }
    expect(fingerReading(band.left, band.top, box, TIMES, 0, 50, TITLED_PLOT_MARGIN)).toEqual({ index: 0, value: 50 })
  })
})

// A phone's readout (#696): a card the plotting band holds stays where
// Recharts puts it; one it cannot rises to the top of the room above the
// chart, and lists as many lines as that whole room holds. The numbers are
// the resting sheet at 390x844, measured 2026-10-14: a 149px chart box, its
// 68px band, and 100px of sheet above the box.
describe('readoutPlace', () => {
  const bandOf = (box: number) => plotBand(0, box, TITLED_PLOT_MARGIN)
  it('rises over the room above a band too short for the card', () => {
    expect(bandOf(149).height).toBe(64)
    expect(readoutPlace(149, TITLED_PLOT_MARGIN, 100, 5)).toEqual({ rows: 8, top: -100 })
  })
  it('stays in a band that holds it', () => {
    const tall = 149 + TOOLTIP_CHROME_PX + 5 * TOOLTIP_ROW_PX
    expect(readoutPlace(tall, TITLED_PLOT_MARGIN, 100, 5).top).toBeNull()
  })
  it('lists what the room from its top to the band\'s foot holds', () => {
    const band = bandOf(149)
    const room = 40 + band.top + band.height
    const rows = Math.floor((room - TOOLTIP_CHROME_PX) / TOOLTIP_ROW_PX)
    expect(readoutPlace(149, TITLED_PLOT_MARGIN, 40, 10).rows).toBe(Math.min(TOOLTIP_MAX_ROWS, rows))
  })
  it('stays put with no room above, as the band\'s own capacity would', () => {
    expect(readoutPlace(149, TITLED_PLOT_MARGIN, 0, 1).top).toBe(null)
  })
})
