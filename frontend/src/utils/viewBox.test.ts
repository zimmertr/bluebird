import { describe, expect, it } from 'vitest'
import { viewBoxOf, visibleBox } from './viewBox'

// Rainier at zoom 11 in a 1000 by 700 canvas.
const RAINIER = { lng: -121.7603, lat: 46.8529 }

// Worked by hand from the Web Mercator formulas at 512px tiles, not read off
// MapLibre: the world is 512 * 2^11 = 1,048,576 px wide, the centre stands at
// x = (lng + 180) / 360 of it and y = (1 - ln(tan(pi/4 + lat/2)) / pi) / 2 of
// it, and each edge is half the canvas from the centre, turned back into
// degrees with lng = x / world * 360 - 180 and lat = atan(sinh(pi * (1 - 2y /
// world))). This is what MapLibre's own getBounds() answers for the same view
// at pitch 0 and bearing 0.
const FLAT: [number, number, number, number] = [
  -121.93196137695313, 46.77066082581818, -121.58863862304688, 46.93501343248324,
]

// The same view turned 30 degrees, from the four corners rotated about the
// centre one at a time, and the box around them.
const TURNED_30: [number, number, number, number] = [
  -121.96904459522361, 46.722878852539566, -121.5515554047764, 46.98260712256241,
]

// A degree of longitude and of latitude in metres at Rainier's latitude.
const M_PER_LNG = 111_320 * Math.cos((RAINIER.lat * Math.PI) / 180)
const M_PER_LAT = 110_574

function expectWithinAMetre(box: number[], expected: number[]) {
  const [w, s, e, n] = box
  const [ew, es, ee, en] = expected
  for (const [got, want, scale] of [
    [w, ew, M_PER_LNG],
    [s, es, M_PER_LAT],
    [e, ee, M_PER_LNG],
    [n, en, M_PER_LAT],
  ]) {
    expect(Math.abs(got - want) * scale).toBeLessThan(1)
  }
}

describe('visibleBox', () => {
  it("is MapLibre's flat view box at bearing 0, to within a metre", () => {
    expectWithinAMetre(visibleBox(RAINIER, 11, 1000, 700, 0), FLAT)
  })

  // A turned rectangle's corners reach past the flat one's edges, and the box
  // grows to hold them.
  it('grows to the turned rectangle under a bearing', () => {
    const turned = visibleBox(RAINIER, 11, 1000, 700, 30)
    expectWithinAMetre(turned, TURNED_30)
    const [w, s, e, n] = turned
    expect(w).toBeLessThan(FLAT[0])
    expect(s).toBeLessThan(FLAT[1])
    expect(e).toBeGreaterThan(FLAT[2])
    expect(n).toBeGreaterThan(FLAT[3])
  })

  // A quarter turn stands the canvas on its side: its width runs north and
  // south, so the box is as wide as the flat one is tall, in pixels.
  it('swaps the two sides at a quarter turn', () => {
    const square = visibleBox(RAINIER, 11, 700, 1000, 0)
    const turned = visibleBox(RAINIER, 11, 1000, 700, 90)
    expectWithinAMetre(turned, square)
    expectWithinAMetre(visibleBox(RAINIER, 11, 1000, 700, -90), square)
  })

  it('halves on each side for every zoom step in', () => {
    const [w, , e] = visibleBox(RAINIER, 11, 1000, 700, 0)
    const [w12, , e12] = visibleBox(RAINIER, 12, 1000, 700, 0)
    expect((e12 - w12) * 2).toBeCloseTo(e - w, 9)
  })

  it('stops at the edge of the Mercator world', () => {
    const [, south, , north] = visibleBox({ lng: 0, lat: 84 }, 1, 1000, 4000, 0)
    expect(north).toBeCloseTo(85.0511287798, 6)
    expect(south).toBeGreaterThan(-85.0511287799)
  })
})

describe('viewBoxOf', () => {
  const map = (pitch: number, bearing = 0) => ({
    getCenter: () => RAINIER,
    getZoom: () => 11,
    getBearing: () => bearing,
    // Read by nothing here: the box is the same at every tilt.
    getPitch: () => pitch,
    getCanvas: () => ({ clientWidth: 1000, clientHeight: 700 }),
  })

  it("reads the map's centre, zoom, bearing and canvas", () => {
    expectWithinAMetre(viewBoxOf(map(0)), FLAT)
    expectWithinAMetre(viewBoxOf(map(0, 30)), TURNED_30)
  })

  // The whole point: a pitched camera's getBounds() runs to the horizon, and
  // this box does not move at all.
  it('does not depend on the pitch', () => {
    const flat = viewBoxOf(map(0, 30))
    for (const pitch of [20, 45, 60]) expect(viewBoxOf(map(pitch, 30))).toEqual(flat)
  })
})
