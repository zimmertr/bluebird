import { describe, expect, it } from 'vitest'
import type { MultiPolygon } from 'geojson'
import { boxMeetsRing, boxesMeet, layersOutOfView, sameLayers, viewBoxes, type ViewBounds } from './layerCoverage'
import type { BBox } from './wildfires'

const view = (west: number, south: number, east: number, north: number): ViewBounds => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
})

// A one-ring stand-in for the server's Oregon and Washington outline.
const OREGON_WASHINGTON: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [[[[-125, 42], [-116.5, 42], [-116.5, 49], [-125, 49], [-125, 42]]]],
}
// A diamond, so a box can sit inside its bounding box and outside the ring.
const DIAMOND: number[][] = [[0, 10], [10, 0], [0, -10], [-10, 0], [0, 10]]

describe('viewBoxes', () => {
  it('keeps a view inside the world as one box', () => {
    expect(viewBoxes(view(-125, 45, -116, 49))).toEqual([[-125, 45, -116, 49]])
  })

  // MapLibre reports a view across the antimeridian as an edge past ±180
  // rather than as a wrap, and the outlines are split there.
  it('splits a view across the antimeridian into two boxes inside the world', () => {
    expect(viewBoxes(view(170, 50, 190, 60))).toEqual([
      [170, 50, 180, 60],
      [-180, 50, -170, 60],
    ])
    expect(viewBoxes(view(-190, 50, -170, 60))).toEqual([
      [170, 50, 180, 60],
      [-180, 50, -170, 60],
    ])
  })

  it('answers a view wider than the world as the whole world', () => {
    expect(viewBoxes(view(-400, -80, 400, 80))).toEqual([[-180, -80, 180, 80]])
  })
})

describe('boxesMeet', () => {
  it('is true for any shared ground, a touching edge included, and false otherwise', () => {
    const a: BBox = [0, 0, 10, 10]
    expect(boxesMeet(a, [5, 5, 15, 15])).toBe(true)
    expect(boxesMeet(a, [10, 0, 20, 10])).toBe(true)
    expect(boxesMeet(a, [11, 0, 20, 10])).toBe(false)
    expect(boxesMeet(a, [0, 11, 10, 20])).toBe(false)
  })
})

describe('boxMeetsRing', () => {
  it('meets a ring with a vertex inside the box', () => {
    expect(boxMeetsRing([-5, 5, 5, 15], DIAMOND)).toBe(true)
  })

  it('meets a ring that holds the whole box', () => {
    expect(boxMeetsRing([-1, -1, 1, 1], DIAMOND)).toBe(true)
  })

  it('meets a ring whose edge crosses the box with no vertex of either inside the other', () => {
    // A thin box across the diamond's upper-right edge, from (0,10) to (10,0).
    expect(boxMeetsRing([4, 4, 6, 20], DIAMOND)).toBe(true)
  })

  // The case a bounding-box test gets wrong: inside the ring's box, outside
  // the ring. Colorado against the Forest Service outline is this shape.
  it('misses a box inside the ring’s bounding box but outside the ring', () => {
    expect(boxMeetsRing([7, 7, 9, 9], DIAMOND)).toBe(false)
    expect(boxMeetsRing([20, 20, 30, 30], DIAMOND)).toBe(false)
  })
})

describe('layersOutOfView', () => {
  const coverage = {
    wildfires: OREGON_WASHINGTON,
    areaClosures: OREGON_WASHINGTON,
    trailClosures: OREGON_WASHINGTON,
  }

  it('names no layer over a view every layer reaches', () => {
    expect(layersOutOfView(view(-122.5, 46.5, -121, 47.5), coverage).size).toBe(0)
  })

  it('names the layers whose outline the view lies wholly outside', () => {
    // Colorado: the stand-in outlines stop at Oregon and Washington, and the
    // three measured national extents reach.
    expect([...layersOutOfView(view(-109, 37, -102, 41), coverage)].sort()).toEqual([
      'closedareas',
      'closedtrails',
      'fires',
    ])
    // The Alps: nothing reaches.
    expect([...layersOutOfView(view(6, 45, 12, 48), coverage)].sort()).toEqual([
      'closedareas',
      'closedtrails',
      'fires',
      'radar',
      'smoke',
      'snow',
    ])
  })

  it('keeps a view that overlaps an outline at its edge', () => {
    // Half over Idaho, half over Washington: the outline is met.
    expect(layersOutOfView(view(-118, 46, -114, 48), coverage).has('closedareas')).toBe(false)
  })

  // Anchorage: the radar network and HMS reach, the snow analysis does not.
  it('reads the measured extents of the raster and plume layers', () => {
    const out = layersOutOfView(view(-150.5, 61, -149, 61.5), {})
    expect([out.has('radar'), out.has('smoke'), out.has('snow')]).toEqual([false, false, true])
  })

  it('greys nothing on an outline the server never published', () => {
    const out = layersOutOfView(view(6, 45, 12, 48), {})
    expect([...out].sort()).toEqual(['radar', 'smoke', 'snow'])
  })

  it('answers the whole world as inside every layer', () => {
    expect(layersOutOfView(view(-400, -80, 400, 80), coverage).size).toBe(0)
  })
})

describe('sameLayers', () => {
  it('compares by members', () => {
    expect(sameLayers(new Set(['radar', 'snow']), new Set(['snow', 'radar']))).toBe(true)
    expect(sameLayers(new Set(['radar']), new Set(['snow']))).toBe(false)
    expect(sameLayers(new Set(['radar']), new Set(['radar', 'snow']))).toBe(false)
  })
})
