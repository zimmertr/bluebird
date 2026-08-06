import { describe, it, expect } from 'vitest'
import type { FeatureCollection, MultiPolygon } from 'geojson'
import {
  classifyCoverage,
  fireKey,
  fireWarningText,
  pointsBbox,
  pointsKey,
  nearestFire,
  FIRE_WARN_MILES,
} from './fireProximity'

// A ~0.1° square fire near (40, -120): west edge -120.0, east edge -119.9.
const square: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { attr_IncidentName: 'Beehive' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-120.0, 40.0],
            [-119.9, 40.0],
            [-119.9, 40.1],
            [-120.0, 40.1],
            [-120.0, 40.0],
          ],
        ],
      },
    },
  ],
}

describe('fireKey', () => {
  it('is a stable 5-decimal coordinate key', () => {
    expect(fireKey(46.85289, -121.76042)).toBe('46.85289,-121.76042')
  })
})

describe('fireWarningText', () => {
  it('phrases an inside hit', () => {
    expect(fireWarningText({ miles: 0, name: 'Beehive' })).toBe(
      'Inside an active wildfire perimeter (Beehive)',
    )
  })
  it('phrases a nearby hit to one decimal', () => {
    expect(fireWarningText({ miles: 3.24, name: 'P-L Gulch' })).toBe(
      '3.2 mi from an active wildfire (P-L Gulch)',
    )
  })
})

describe('pointsBbox', () => {
  it('pads a single point by the margin on every side', () => {
    const bbox = pointsBbox([{ latitude: 40, longitude: -120 }], 11)!
    expect(bbox).not.toBeNull()
    expect(bbox[1]).toBeCloseTo(40 - 11 / 69, 3) // south
    expect(bbox[3]).toBeCloseTo(40 + 11 / 69, 3) // north
    const lonPad = 11 / (69 * Math.cos((40 * Math.PI) / 180))
    expect(bbox[0]).toBeCloseTo(-120 - lonPad, 3) // west
    expect(bbox[2]).toBeCloseTo(-120 + lonPad, 3) // east
  })
  it('is null with no points', () => {
    expect(pointsBbox([], 11)).toBeNull()
  })
})

describe('nearestFire', () => {
  it('reports 0 miles inside a perimeter, with the incident name', () => {
    const near = nearestFire(40.05, -119.95, square)
    expect(near).not.toBeNull()
    expect(near!.miles).toBe(0)
    expect(near!.name).toBe('Beehive')
  })

  it('measures distance to the perimeter edge, not a centroid', () => {
    // ~0.1° east of the -119.9 edge at lat 40.05 ≈ 5.3 mi.
    const near = nearestFire(40.05, -119.8, square)
    expect(near!.miles).toBeGreaterThan(4.8)
    expect(near!.miles).toBeLessThan(5.8)
  })

  it('returns null when there are no fires', () => {
    expect(nearestFire(40, -120, { type: 'FeatureCollection', features: [] })).toBeNull()
  })

  it('returns the closest of several fires', () => {
    const two: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        square.features[0],
        {
          type: 'Feature',
          properties: { poly_IncidentName: 'Far Away' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-100.0, 30.0],
                [-99.9, 30.0],
                [-99.9, 30.1],
                [-100.0, 30.1],
                [-100.0, 30.0],
              ],
            ],
          },
        },
      ],
    }
    expect(nearestFire(40.05, -119.95, two)!.name).toBe('Beehive')
  })

  it('handles MultiPolygon geometry', () => {
    const multi: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { attr_IncidentName: 'Twin' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-121.0, 41.0],
                  [-120.9, 41.0],
                  [-120.9, 41.1],
                  [-121.0, 41.1],
                  [-121.0, 41.0],
                ],
              ],
              [
                [
                  [-120.0, 40.0],
                  [-119.9, 40.0],
                  [-119.9, 40.1],
                  [-120.0, 40.1],
                  [-120.0, 40.0],
                ],
              ],
            ],
          },
        },
      ],
    }
    expect(nearestFire(40.05, -119.95, multi)!.miles).toBe(0)
  })

  it('still returns a distant nearest fire (the caller applies the threshold)', () => {
    const near = nearestFire(30, -100, square)
    expect(near).not.toBeNull()
    // A literal, not FIRE_WARN_MILES. Compared against the constant this
    // assertion moved with it and so could not notice the radius changing;
    // all it needs to say is that a far fire is reported rather than dropped.
    expect(near!.miles).toBeGreaterThan(100)
  })
})

describe('FIRE_WARN_MILES', () => {
  it('warns within ten miles of a perimeter', () => {
    // Pinned to the literal because the radius is the product decision, and a
    // safety-adjacent one: widening it floods every report with warnings,
    // narrowing it drops real ones. Nothing else in either suite notices.
    expect(FIRE_WARN_MILES).toBe(10)
  })
})

// The identity useFireProximity keys its lookup on. Keying on the array
// reference instead meant re-querying NIFC, and aborting the request already in
// flight, every time a re-rank handed the hook a fresh array holding the very
// same destinations.
describe('pointsKey', () => {
  const a = { latitude: 46.8523, longitude: -121.7603 }
  const b = { latitude: 48.1122, longitude: -121.1139 }

  it('ignores the order the same destinations arrive in', () => {
    expect(pointsKey([a, b])).toBe(pointsKey([b, a]))
  })

  it('ignores the identity of the array holding them', () => {
    expect(pointsKey([a, b])).toBe(pointsKey([{ ...a }, { ...b }]))
  })

  it('changes when a destination joins or leaves', () => {
    expect(pointsKey([a])).not.toBe(pointsKey([a, b]))
    expect(pointsKey([])).not.toBe(pointsKey([a]))
  })

  it('changes when a destination moves', () => {
    expect(pointsKey([a])).not.toBe(pointsKey([{ latitude: 46.9, longitude: -121.7603 }]))
  })

  // Same rounding as the warning keys themselves, so two rows the map treats
  // as one place cannot look like two questions to ask about fires.
  it('collapses coordinates finer than the warning key resolution', () => {
    expect(pointsKey([a])).toBe(pointsKey([{ latitude: 46.852301, longitude: -121.760299 }]))
  })
})

// A toy coverage in the server's published shape: one square per hemisphere,
// mirroring the real geometry's antimeridian split (#256). The classifier is
// exercised against the shape's PROPERTIES (split rings, outer-ring test),
// not the real outline — the backend pins that geometry to named places.
const coverage: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    // "CONUS": lon -125..-66, lat 24..49
    [
      [
        [-125, 24],
        [-66, 24],
        [-66, 49],
        [-125, 49],
        [-125, 24],
      ],
    ],
    // "Aleutians west of the antimeridian": lon 172..180, lat 51..53.5
    [
      [
        [172, 51],
        [180, 51],
        [180, 53.5],
        [172, 53.5],
        [172, 51],
      ],
    ],
  ],
}

const point = (latitude: number, longitude: number) => ({ latitude, longitude })

describe('classifyCoverage', () => {
  it('answers full when every point is inside the coverage', () => {
    expect(classifyCoverage([point(46.85, -121.76), point(40, -105)], coverage)).toBe('full')
  })

  it('answers none when the dataset is silent about the whole field', () => {
    // The Alps and the Canadian Rockies: the two live-verified false-safe
    // areas from the issue.
    expect(classifyCoverage([point(46.02, 7.75)], coverage)).toBe('none')
    expect(classifyCoverage([point(53.1, -119.2)], coverage)).toBe('none')
  })

  it('answers partial for a field straddling the boundary', () => {
    expect(classifyCoverage([point(48.9, -122.2), point(49.5, -122.2)], coverage)).toBe('partial')
  })

  it('finds a point in a polygon on the far side of the antimeridian', () => {
    // Attu-like: eastern-hemisphere longitude, its own split polygon. No
    // wraparound math anywhere — the split IS the handling.
    expect(classifyCoverage([point(52.85, 173.2)], coverage)).toBe('full')
  })

  it('trusts an answer with no coverage member, like an older server', () => {
    expect(classifyCoverage([point(46.02, 7.75)], undefined)).toBe('full')
  })

  it('has nothing to say about an empty field', () => {
    expect(classifyCoverage([], coverage)).toBe('full')
  })
})
