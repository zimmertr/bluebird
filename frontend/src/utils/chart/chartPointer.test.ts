import { describe, expect, it } from 'vitest'
import {
  CHART_TITLE_PX,
  PLOT_MARGIN,
  TITLED_PLOT_MARGIN,
  X_AXIS_HEIGHT_PX,
  Y_AXIS_WIDTH_PX,
  fingerReading,
  hourIndexAt,
  MIN_PANEL_BAND_PX,
  panelFloorPx,
  plotBand,
  readoutPlace,
  splitAfterDrag,
  EVEN_GRID,
  gridAfterDrag,
  panelWidthFloorPx,
  CARD_CURSOR_OFFSET_PX,
  MIN_PANEL_BAND_WIDTH_PX,
  WIDEST_X_TICK_PX,
  cardPlacement,
  xAxisPx,
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
    expect(bandOf(149).height).toBe(68)
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

// Two stacked panels share one time axis (#499): the top one prints none.
describe('a stacked panel', () => {
  it('runs its band to the foot of its box when it draws no axis', () => {
    expect(xAxisPx(false)).toBe(0)
    expect(xAxisPx(true)).toBe(X_AXIS_HEIGHT_PX)
    const top = plotBand(400, 200, PLOT_MARGIN, false)
    const bottom = plotBand(400, 200, PLOT_MARGIN, true)
    expect(top.height - bottom.height).toBe(X_AXIS_HEIGHT_PX)
    // Same left and right edges, so the two panels' hours line up.
    expect(top.left).toBe(bottom.left)
    expect(top.width).toBe(bottom.width)
  })

  it('reads a finger through the band it draws', () => {
    const times = [0, 1, 2]
    const box = { width: 400, height: PLOT_MARGIN.top + PLOT_MARGIN.bottom + 100 }
    // The band's foot reads the axis minimum only where there is no strip.
    const y = PLOT_MARGIN.top + 100
    expect(fingerReading(200, y, box, times, 0, 10, PLOT_MARGIN, false)?.value).toBeCloseTo(0)
  })

  it('keeps a floor of margins, strip and the least band', () => {
    expect(panelFloorPx(PLOT_MARGIN, false)).toBe(PLOT_MARGIN.top + PLOT_MARGIN.bottom + MIN_PANEL_BAND_PX)
    expect(panelFloorPx(PLOT_MARGIN, true)).toBe(panelFloorPx(PLOT_MARGIN, false) + X_AXIS_HEIGHT_PX)
  })
})

describe('splitAfterDrag', () => {
  it('moves the split by the drag, as a share of the height', () => {
    expect(splitAfterDrag(0.5, 50, 400, 50, 72)).toBe(0.375)
    expect(splitAfterDrag(0.5, -50, 400, 50, 72)).toBe(0.625)
  })

  it('holds each panel at its floor', () => {
    expect(splitAfterDrag(0.5, 1000, 400, 50, 72)).toBe(50 / 400)
    expect(splitAfterDrag(0.5, -1000, 400, 50, 72)).toBe(328 / 400)
  })

  it('splits evenly a box too short for both floors', () => {
    expect(splitAfterDrag(0.3, 10, 100, 50, 72)).toBe(0.5)
    expect(splitAfterDrag(0.3, 10, 0, 50, 72)).toBe(0.5)
  })
})

// The grid's one knob (#499): both splits move with it, held to [0, 1] and
// no floor, so a corner hands one panel the whole area.
describe('gridAfterDrag', () => {
  it('moves both splits by the drag, as shares of the tracks', () => {
    expect(gridAfterDrag(EVEN_GRID, 100, -50, 400, 200)).toEqual({ x: 0.75, y: 0.25 })
  })

  it('reaches the corners and stops there', () => {
    expect(gridAfterDrag(EVEN_GRID, 1000, 1000, 400, 200)).toEqual({ x: 1, y: 1 })
    expect(gridAfterDrag(EVEN_GRID, -1000, -1000, 400, 200)).toEqual({ x: 0, y: 0 })
  })

  it('keeps a split it has no size to move by', () => {
    expect(gridAfterDrag({ x: 0.3, y: 0.6 }, 50, 50, 0, 0)).toEqual({ x: 0.3, y: 0.6 })
  })

  // Two of the widest ticks on one line each, so a squeezed panel prints its
  // time axis rather than one tick wrapped in two (TJ, 2026-10-29).
  it('floors a panel width at its margins, its y axis and two of the widest ticks', () => {
    expect(WIDEST_X_TICK_PX).toBe(74)
    expect(MIN_PANEL_BAND_WIDTH_PX).toBe(2 * WIDEST_X_TICK_PX + 8)
    expect(panelWidthFloorPx(PLOT_MARGIN)).toBe(PLOT_MARGIN.left + Y_AXIS_WIDTH_PX + PLOT_MARGIN.right + MIN_PANEL_BAND_WIDTH_PX)
    // The height keeps its own 40px.
    expect(MIN_PANEL_BAND_PX).toBe(40)
  })
})

// The hover card over several panels (#499): inside the area, from the
// cursor and the card's measured size.
describe('cardPlacement', () => {
  const area = { w: 800, h: 400 }
  const card = { w: 200, h: 120 }
  const o = CARD_CURSOR_OFFSET_PX

  it('stands below and right of the cursor where it fits', () => {
    expect(cardPlacement({ x: 100, y: 50 }, card, area)).toEqual({ x: 100 + o, y: 50 + o })
  })

  it("flips to the cursor's left at the right edge", () => {
    expect(cardPlacement({ x: 700, y: 50 }, card, area)).toEqual({ x: 700 - o - card.w, y: 50 + o })
  })

  it('pulls up at the bottom edge', () => {
    expect(cardPlacement({ x: 100, y: 350 }, card, area)).toEqual({ x: 100 + o, y: area.h - card.h })
  })

  it('never crosses the left or top edge, even for a card wider or taller than the area', () => {
    expect(cardPlacement({ x: 150, y: 10 }, { w: 300, h: 500 }, { w: 320, h: 400 })).toEqual({ x: 0, y: 0 })
  })
})
