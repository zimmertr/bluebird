import { describe, expect, it } from 'vitest'
import { boxRing, sameRing, searchArea } from './searchArea'

const drawn = { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] as [number, number][][] }

describe('boxRing', () => {
  it('closes the box anticlockwise from its south-west corner, to four decimals', () => {
    expect(boxRing([-121.123456, 46.5, -120.9, 46.987654]).coordinates[0]).toEqual([
      [-121.1235, 46.5],
      [-120.9, 46.5],
      [-120.9, 46.9877],
      [-121.1235, 46.9877],
      [-121.1235, 46.5],
    ])
  })

  it('makes the same ring of a box moved by less than the rounding', () => {
    expect(sameRing(boxRing([-121, 46, -120, 47]), boxRing([-121.00001, 46, -120, 47]))).toBe(true)
    expect(sameRing(boxRing([-121, 46, -120, 47]), boxRing([-121.01, 46, -120, 47]))).toBe(false)
  })
})

describe('searchArea', () => {
  const view = boxRing([-121, 46, -120, 47])

  it('searches the drawn ring once a point is down, mid-draw included', () => {
    expect(searchArea(drawn, 3, view, false)).toEqual({ polygon: drawn, pointCount: 3, source: 'drawn' })
    expect(searchArea(null, 2, view, false).source).toBe('drawn')
  })

  it('searches the view while no ring is drawn, as a four-point ring', () => {
    expect(searchArea(null, 0, view, false)).toEqual({ polygon: view, pointCount: 4, source: 'view' })
  })

  it('searches no ring for a list, and none before the map reports its view', () => {
    expect(searchArea(null, 0, view, true)).toEqual({ polygon: null, pointCount: 0, source: 'list' })
    expect(searchArea(null, 0, null, false).polygon).toBeNull()
  })
})
