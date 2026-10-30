import { describe, expect, it } from 'vitest'
import { defaultLayout, evenRows, isChartLayout, layoutFor, layoutsFor, rowRects, rowsOf, sharesAfterDrag } from './chartLayout'

describe('the panel layouts', () => {
  it('offers each count its own, the one that shipped first leading', () => {
    expect(layoutsFor(1)).toEqual([])
    expect(layoutsFor(2)).toEqual(['column', 'row'])
    expect(layoutsFor(4)).toEqual(['2x2', 'row', 'column', '1-3', '1-2-1'])
    expect([2, 3, 4].map(defaultLayout)).toEqual(['column', '2-1', '2x2'])
  })

  it('keeps a choice the count offers and falls back otherwise', () => {
    expect(layoutFor('1-3', 4)).toBe('1-3')
    expect(layoutFor('1-3', 3)).toBe('2-1')
    expect(layoutFor(null, 2)).toBe('column')
    expect(isChartLayout('1-2-1')).toBe(true)
    expect(isChartLayout('3x3')).toBe(false)
  })

  it('reads each layout as rows of panels', () => {
    expect(rowsOf('1-2-1', 4)).toEqual([1, 2, 1])
    expect(rowsOf('row', 3)).toEqual([3])
    expect(rowsOf('column', 4)).toEqual([1, 1, 1, 1])
  })

  it('places every panel with the gap between rows and between panels', () => {
    const rects = rowRects(evenRows([1, 3]), 316, 208, 8)
    expect(rects).toEqual([
      { x: 0, y: 0, w: 316, h: 100 },
      { x: 0, y: 108, w: 100, h: 100 },
      { x: 108, y: 108, w: 100, h: 100 },
      { x: 216, y: 108, w: 100, h: 100 },
    ])
  })

  it('moves share across one bar, held to the pair with no floor', () => {
    expect(sharesAfterDrag([0.5, 0.5], 0, 50, 200)).toEqual([0.75, 0.25])
    expect(sharesAfterDrag([0.5, 0.5], 0, 500, 200)).toEqual([1, 0])
    const start = [0.5, 0.5]
    expect(sharesAfterDrag(start, 1, 10, 200)).toBe(start)
  })
})
