import { describe, expect, it } from 'vitest'
import { PLOT_MARGIN, X_AXIS_HEIGHT_PX, Y_AXIS_WIDTH_PX, fingerReading, hourIndexAt, plotBand } from './chartPointer'

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
