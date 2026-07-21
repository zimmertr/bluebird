import { describe, it, expect } from 'vitest'
import type { FeatureCollection } from 'geojson'
import {
  fireKey,
  fireWarningText,
  pointsBbox,
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
    expect(near!.miles).toBeGreaterThan(FIRE_WARN_MILES)
  })
})
