import { describe, expect, it } from 'vitest'
import { defaultLayout, evenRows, isChartLayout, layoutFor, layoutsFor, rowCrossings, rowRects, rowsOf, sharesAfterDrag } from './chartLayout'

describe('the panel layouts', () => {
  it('offers each count its own, the one that shipped first leading', () => {
    expect(layoutsFor(1)).toEqual([])
    expect(layoutsFor(2)).toEqual(['column', 'row'])
    expect(layoutsFor(4)).toEqual(['1-3', '2x2', 'column', '1-2-1', 'row'])
    expect(layoutsFor(3)).toEqual(['1-2', '2-1', 'column', 'row'])
    expect([2, 3, 4].map(defaultLayout)).toEqual(['column', '1-2', '1-3'])
  })

  it('keeps a choice the count offers and falls back otherwise', () => {
    expect(layoutFor('1-3', 4)).toBe('1-3')
    expect(layoutFor('1-3', 3)).toBe('1-2')
    expect(layoutFor(null, 2)).toBe('column')
    expect(isChartLayout('1-2-1')).toBe(true)
    expect(isChartLayout('3x3')).toBe(false)
  })

  it('finds a crossing wherever a row bar meets a panel bar', () => {
    expect(rowCrossings([1, 3]).map((x) => x.panel)).toEqual([2, 3])
    expect(rowCrossings([1, 2, 1]).map((x) => [x.rowAt, x.panel])).toEqual([[0, 2], [1, 2]])
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
