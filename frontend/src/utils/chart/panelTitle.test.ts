import { describe, expect, it } from 'vitest'
import { PHONE_PLOT_MARGIN, PLOT_MARGIN, Y_AXIS_WIDTH_PX, panelFloorPx } from './chartPointer'
import { CHART_TICK_PX } from './chartColors'
import { evenRows, rowRects } from './chartLayout'
import {
  CHROME_LABEL_OFFSET_PX,
  GHOST_SCALE,
  TITLED_TOP_LABEL_DY,
  TITLE_HEIGHT_PX,
  TITLE_INSET_PX,
  UNDER_TITLE_PX,
  dropBar,
  extremeLabelPlacement,
  ghostTransform,
  slotAt,
  titleAt,
} from './panelTitle'

describe('the panel title', () => {
  // At the plot band's corner, in from it, so the band keeps its size and
  // its margins (#846).
  it('stands at the plot band\'s top left, inset', () => {
    expect(titleAt()).toEqual({ left: PLOT_MARGIN.left + Y_AXIS_WIDTH_PX + 4, top: PLOT_MARGIN.top + 4 })
    expect(titleAt(PHONE_PLOT_MARGIN).top).toBe(PHONE_PLOT_MARGIN.top + TITLE_INSET_PX)
    expect(PLOT_MARGIN).toEqual({ top: 8, right: 16, bottom: 2, left: 8 })
  })

  it('moves a top-left chrome label under the chip and its air', () => {
    expect(UNDER_TITLE_PX).toBe(TITLE_INSET_PX + TITLE_HEIGHT_PX + 2)
    expect(CHROME_LABEL_OFFSET_PX + TITLED_TOP_LABEL_DY).toBe(UNDER_TITLE_PX)
  })

  // The extreme label moves; the title never does (#846).
  it('keeps the extreme label where it stood in an untitled panel', () => {
    expect(extremeLabelPlacement(8 + 2, 8, false)).toEqual({ position: 'insideTopRight', dy: 0 })
    expect(extremeLabelPlacement(8 + 30, 8, false)).toEqual({ position: 'insideBottomRight', dy: 0 })
  })

  it('takes the extreme label out of the chip\'s rows in a titled panel', () => {
    const top = PLOT_MARGIN.top
    // A highest line in the top headroom hangs its label below, under the chip.
    const near = extremeLabelPlacement(top + 2, top, true)
    expect(near.position).toBe('insideTopRight')
    expect(top + 2 + CHROME_LABEL_OFFSET_PX + near.dy).toBe(top + UNDER_TITLE_PX)
    // A line whose label above it would meet the chip hangs it below instead.
    expect(extremeLabelPlacement(top + 30, top, true)).toEqual({ position: 'insideTopRight', dy: 0 })
    // A line low enough keeps its label above it.
    const low = UNDER_TITLE_PX + CHROME_LABEL_OFFSET_PX + CHART_TICK_PX
    expect(extremeLabelPlacement(top + low, top, true)).toEqual({ position: 'insideBottomRight', dy: 0 })
  })

  // At the shortest panel the floors draw, a 40px band, the label moved under
  // the chip still ends inside the band.
  it('keeps the moved label inside the shortest band', () => {
    const band = panelFloorPx(PLOT_MARGIN, true) - PLOT_MARGIN.top - PLOT_MARGIN.bottom - 22
    expect(band).toBe(40)
    expect(UNDER_TITLE_PX + CHART_TICK_PX).toBeLessThanOrEqual(band)
  })
})

describe('the title drag', () => {
  // One over three at 316 by 208 with 8px gutters: one full-width panel over three.
  const boxes = rowRects(evenRows([1, 3]), 316, 208, 8)
  const all = [true, true, true, true]

  it('keeps the pressed point under the pointer at half size', () => {
    expect(GHOST_SCALE).toBe(0.5)
    expect(ghostTransform({ x: 300, y: 200 }, { x: 100, y: 40 })).toBe('translate(250px, 180px) scale(0.5)')
    expect(ghostTransform({ x: 300, y: 200 }, { x: 100, y: 40 }, 1)).toBe('translate(200px, 160px) scale(1)')
  })

  it('finds the slot under the pointer, a gutter counting for its neighbour', () => {
    expect(slotAt(boxes, all, 150, 150, 4)).toBe(2)
    // In the gutter between slots 1 and 2, nearer 1.
    expect(slotAt(boxes, all, 102, 150, 4)).toBe(1)
    expect(slotAt(boxes, all, 106, 150, 4)).toBe(2)
    // In the row gutter, over slot 3.
    expect(slotAt(boxes, all, 250, 105, 4)).toBe(3)
  })

  it('takes no drop on the first slot, a held panel, or outside every box', () => {
    expect(slotAt(boxes, all, 150, 50, 4)).toBeNull()
    expect(slotAt(boxes, [true, true, false, true], 150, 150, 4)).toBeNull()
    expect(slotAt(boxes, all, 150, 400, 4)).toBeNull()
    expect(slotAt(boxes, all, -20, 150, 4)).toBeNull()
  })

  it('marks the trailing edge moving later and the leading edge moving earlier', () => {
    // 1 to 2: after slot 2, in the gutter on its right.
    expect(dropBar(boxes, 1, 2, 2)).toEqual({ x: 211, y: 108, w: 2, h: 100 })
    // 3 to 2: before slot 2, in the gutter on its left.
    expect(dropBar(boxes, 3, 2, 2)).toEqual({ x: 103, y: 108, w: 2, h: 100 })
    // 3 to 1: slot 1 opens its row, so its top, in the row gutter.
    expect(dropBar(boxes, 3, 1, 2)).toEqual({ x: 0, y: 103, w: 100, h: 2 })
    // 1 to 3: slot 3 ends the area, so just inside its foot.
    expect(dropBar(boxes, 1, 3, 2)).toEqual({ x: 216, y: 206, w: 100, h: 2 })
    expect(dropBar(boxes, 2, 2, 2)).toBeNull()
  })

  it('stands a column\'s bar on the top or foot of a row of one', () => {
    const column = rowRects(evenRows([1, 1, 1]), 300, 316, 8)
    expect(dropBar(column, 1, 2, 2)).toEqual({ x: 0, y: 314, w: 300, h: 2 })
    expect(dropBar(column, 2, 1, 2)).toEqual({ x: 0, y: 103, w: 300, h: 2 })
    // A 2 by 2 grid: slot 1 has slot 0 beside it, so its left side; slot 2
    // opens the bottom row, so its top; slot 3 ends the area, so its foot.
    const grid = rowRects(evenRows([2, 2]), 208, 208, 8)
    expect(dropBar(grid, 3, 1, 2)).toEqual({ x: 103, y: 0, w: 2, h: 100 })
    expect(dropBar(grid, 3, 2, 2)).toEqual({ x: 0, y: 103, w: 100, h: 2 })
    expect(dropBar(grid, 2, 3, 2)).toEqual({ x: 108, y: 206, w: 100, h: 2 })
  })
})
