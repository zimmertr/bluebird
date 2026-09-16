import { describe, expect, it } from 'vitest'
import type { GeoPolygon } from '../types'
import {
  bboxAreaKm2,
  featureRow,
  makeDrawData,
  pendingFC,
  polygonsOf,
  ringToPts,
} from './drawGeometry'

type Feature = { type: string; properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }
const featuresOf = (data: object) => (data as { features: Feature[] }).features
const kinds = (data: object) => featuresOf(data).map((f) => f.properties?.kind)

describe('bboxAreaKm2', () => {
  // Hand-computed from the formula the backend gates on: one degree of
  // latitude is 111 km, one degree of longitude is 111 km times the cosine of
  // the box's middle latitude. At 47.5°N that is 111 x 74.99 = 8,324 km².
  it('measures a one-degree box in the Cascades', () => {
    const ring: [number, number][] = [
      [-122, 47],
      [-121, 47],
      [-121, 48],
      [-122, 48],
    ]
    expect(bboxAreaKm2(ring)).toBeCloseTo(8323.947, 3)
  })

  // The cosine is taken at the box's MIDDLE latitude, so a box straddling the
  // equator loses nothing to it: 55.5 x 55.5 km.
  it('narrows a degree of longitude by the cosine of the middle latitude', () => {
    const straddling: [number, number][] = [
      [0, -0.25],
      [0.5, -0.25],
      [0.5, 0.25],
      [0, 0.25],
    ]
    expect(bboxAreaKm2(straddling)).toBeCloseTo(3080.25, 6)
    // The same box in the Cascades is a third narrower.
    const north: [number, number][] = straddling.map(([lon, lat]) => [lon, lat + 47.5])
    expect(bboxAreaKm2(north)).toBeLessThan(bboxAreaKm2(straddling)! * 0.7)
  })

  // The box around the ring, not the ring: a triangle inside a square measures
  // the square. This is the approximation the server makes, and the browser
  // blocks Analyze where the server would refuse, so it has to make it too.
  it('measures the box around the ring rather than the ring', () => {
    const square: [number, number][] = [
      [-122, 47],
      [-121, 47],
      [-121, 48],
      [-122, 48],
    ]
    const triangle: [number, number][] = [
      [-122, 47],
      [-121, 47],
      [-121, 48],
    ]
    expect(bboxAreaKm2(triangle)).toBeCloseTo(bboxAreaKm2(square)!, 6)
  })

  // Extremes rather than order, so a ring drawn clockwise, one drawn
  // anticlockwise, and one closed by a repeated first vertex all measure the
  // same area.
  it('does not depend on the order of the points or on a closing vertex', () => {
    const ring: [number, number][] = [
      [-122, 47],
      [-121, 47],
      [-121, 48],
      [-122, 48],
    ]
    const reversed = [...ring].reverse()
    const closed = [...ring, ring[0]]
    expect(bboxAreaKm2(reversed)).toBeCloseTo(bboxAreaKm2(ring)!, 9)
    expect(bboxAreaKm2(closed)).toBeCloseTo(bboxAreaKm2(ring)!, 9)
  })

  // What the panel's area line now reads, both ways round (#429): `App.tsx`
  // measures whatever ring it holds, and a ring restored from a link arrives as
  // a closed GeoPolygon where a drawn one is the editable point list. One area
  // for one shape, with no edit needed to produce it.
  it('measures a restored ring and a drawn one as the same area', () => {
    const drawn: [number, number][] = [
      [-121.9, 47.4],
      [-121.2, 47.4],
      [-121.2, 47.9],
      [-121.9, 47.9],
    ]
    const restored: GeoPolygon = { type: 'Polygon', coordinates: [[...drawn, drawn[0]]] }
    expect(bboxAreaKm2(ringToPts(restored))).toBe(bboxAreaKm2(drawn))
    expect(bboxAreaKm2(ringToPts(restored))).not.toBeNull()
  })

  it('has nothing to measure under three points', () => {
    expect(bboxAreaKm2([])).toBeNull()
    expect(bboxAreaKm2([[-122, 47]])).toBeNull()
    expect(
      bboxAreaKm2([
        [-122, 47],
        [-121, 47],
      ]),
    ).toBeNull()
  })
})

describe('ringToPts', () => {
  it('drops the vertex that closes the ring', () => {
    expect(
      ringToPts({
        type: 'Polygon',
        coordinates: [
          [
            [-122, 47],
            [-121, 47],
            [-121, 48],
            [-122, 47],
          ],
        ],
      }),
    ).toEqual([
      [-122, 47],
      [-121, 47],
      [-121, 48],
    ])
  })

  it('leaves an unclosed ring whole', () => {
    expect(
      ringToPts({
        type: 'Polygon',
        coordinates: [
          [
            [-122, 47],
            [-121, 47],
            [-121, 48],
          ],
        ],
      }),
    ).toHaveLength(3)
  })

  it('reads the outer ring only, and answers nothing for an empty polygon', () => {
    const withHole = ringToPts({
      type: 'Polygon',
      coordinates: [
        [
          [-122, 47],
          [-121, 47],
          [-121, 48],
          [-122, 47],
        ],
        [
          [-121.8, 47.2],
          [-121.6, 47.2],
          [-121.6, 47.4],
          [-121.8, 47.2],
        ],
      ],
    })
    expect(withHole).toHaveLength(3)
    expect(ringToPts({ type: 'Polygon', coordinates: [] })).toEqual([])
  })
})

describe('makeDrawData', () => {
  const ring: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 2],
  ]

  it('draws a closed polygon with a handle per vertex and per segment', () => {
    const data = makeDrawData(ring)
    expect(kinds(data)).toEqual([
      'polygon',
      'midpoint',
      'midpoint',
      'midpoint',
      'vertex',
      'vertex',
      'vertex',
    ])
    // The ring the fill draws repeats its first point, which is what closes it.
    const polygon = featuresOf(data)[0]
    expect(polygon.geometry.coordinates).toEqual([[[0, 0], [2, 0], [2, 2], [0, 0]]])
  })

  // Vertices are pushed last so they render on top of the midpoints: both are
  // grab targets and the vertex is the one that has to win.
  it('puts every vertex after every midpoint', () => {
    const order = kinds(makeDrawData(ring))
    expect(order.lastIndexOf('midpoint')).toBeLessThan(order.indexOf('vertex'))
  })

  it('closes the midpoint ring, so the last segment has a handle too', () => {
    const midpoints = featuresOf(makeDrawData(ring)).filter((f) => f.properties?.kind === 'midpoint')
    // Between the last vertex and the first: (2,2) to (0,0).
    expect(midpoints[2].geometry.coordinates).toEqual([1, 1])
    expect(midpoints[2].properties?.segment).toBe(2)
  })

  it('draws two points as an open line with one midpoint between them', () => {
    const data = makeDrawData([
      [0, 0],
      [2, 0],
    ])
    expect(kinds(data)).toEqual(['line', 'midpoint', 'vertex', 'vertex'])
    expect(featuresOf(data)[1].geometry.coordinates).toEqual([1, 0])
  })

  it('draws one point as a bare vertex, with no shape and no midpoint', () => {
    expect(kinds(makeDrawData([[0, 0]]))).toEqual(['vertex'])
  })

  it('draws nothing at all for an empty ring', () => {
    expect(featuresOf(makeDrawData([]))).toEqual([])
  })
})

describe('featureRow', () => {
  const props = {
    name: 'Mount Daniel',
    type: 'peak',
    osm_id: 'node/123',
    elevation_ft: 7960,
    precip: 0.4,
    wind_avg: 12,
    temp_avg: 41,
    freeze_min: 6200,
    aqi_avg: 30,
    aqi_max: 44,
  }

  it('reads the marker properties back as a row', () => {
    expect(featureRow(props, 47.56, -121.17)).toEqual({
      name: 'Mount Daniel',
      type: 'peak',
      osm_id: 'node/123',
      latitude: 47.56,
      longitude: -121.17,
      elevation_ft: 7960,
      precip_total_in: 0.4,
      wind_avg_mph: 12,
      temp_avg_f: 41,
      freeze_min_ft: 6200,
      aqi_avg: 30,
      aqi_max: 44,
    })
  })

  // The coordinates are arguments rather than properties because a rendered
  // feature's geometry is snapped to the tile grid, and the fire-warning map is
  // keyed on the exact pair.
  it('takes the coordinates from the caller, not from the feature', () => {
    const row = featureRow({ ...props, latitude: 0, longitude: 0 }, 47.56, -121.17)
    expect([row.latitude, row.longitude]).toEqual([47.56, -121.17])
  })

  it('reads a value the marker does not carry as null rather than undefined', () => {
    const row = featureRow({ name: 'Unknown', type: 'peak' }, 47, -121)
    expect(row.osm_id).toBeNull()
    expect(row.elevation_ft).toBeNull()
    expect(row.freeze_min_ft).toBeNull()
    expect(row.aqi_avg).toBeNull()
    expect(row.aqi_max).toBeNull()
  })
})

describe('pendingFC', () => {
  it('places each pending destination in GeoJSON order, with its name', () => {
    const fc = pendingFC([
      { name: 'Ingalls', latitude: 47.43, longitude: -120.94, source: 'csv' },
      { name: 'Stuart', latitude: 47.47, longitude: -120.9, source: 'search' },
    ])
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [-120.94, 47.43] })
    expect(fc.features[0].properties).toEqual({ name: 'Ingalls' })
  })

  it('answers an empty collection for nothing pending', () => {
    expect(pendingFC([]).features).toEqual([])
  })
})

describe('polygonsOf', () => {
  const square = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ]

  it('keeps each polygon as its own ring list, outer ring first', () => {
    const hole = [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.2],
    ]
    const rings = polygonsOf([
      { geometry: { type: 'Polygon', coordinates: [square[0], hole] } },
    ])
    expect(rings).toHaveLength(1)
    expect(rings[0]).toHaveLength(2)
    expect(rings[0][0][0]).toEqual([0, 0])
  })

  // One lake arrives as several polygons when it is drawn across tiles, and
  // each has to be poled on its own.
  it('splits a multipolygon into one entry per polygon', () => {
    const rings = polygonsOf([
      { geometry: { type: 'MultiPolygon', coordinates: [square, square] } },
    ])
    expect(rings).toHaveLength(2)
  })

  it('contributes nothing for a feature that is not an area', () => {
    expect(
      polygonsOf([
        { geometry: { type: 'Point', coordinates: [0, 0] } },
        { geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } },
      ]),
    ).toEqual([])
  })

  // The tiles carry a third ordinate on some sources; a pole is a plan view.
  it('keeps two ordinates per position', () => {
    const rings = polygonsOf([
      { geometry: { type: 'Polygon', coordinates: [[[0, 0, 12], [1, 0, 12], [1, 1, 12], [0, 0, 12]]] } },
    ])
    expect(rings[0][0][0]).toEqual([0, 0])
  })
})
