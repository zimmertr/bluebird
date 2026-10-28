import type { MultiPolygon } from 'geojson'
import { describe, expect, it } from 'vitest'
import { analysisPoints, modelOutsideDomain } from './modelDomain'

// Whether a regional model reaches every place an analysis would forecast
// (#803, W8). The outline is a square over the Cascades standing in for the
// published HRRR grid: the test is the cast, not the grid's shape, which
// `test_model_domains.py` holds on the backend.

const SQUARE: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [-125, 45],
        [-118, 45],
        [-118, 50],
        [-125, 50],
        [-125, 45],
      ],
    ],
  ],
}
const HRRR = { label: 'NOAA HRRR', domain: SQUARE }
const GFS = { label: 'NOAA GFS', domain: null }

const RAINIER = { latitude: 46.85, longitude: -121.76 }
const BANFF = { latitude: 51.18, longitude: -115.57 }

describe('modelOutsideDomain', () => {
  it('passes when every point is inside every published domain', () => {
    expect(modelOutsideDomain([HRRR], [RAINIER])).toBeNull()
  })

  it('names the model whose domain leaves a point out', () => {
    expect(modelOutsideDomain([HRRR], [RAINIER, BANFF])).toBe('NOAA HRRR')
  })

  // A global model publishes no domain, and neither does a regional one this
  // deployment has no outline for: Open-Meteo's own refusal stays the check.
  it('never holds a model with no domain', () => {
    expect(modelOutsideDomain([GFS, { label: 'X' }], [BANFF])).toBeNull()
  })

  it('names the first model in the order given, the ranking model leading', () => {
    const other = { label: 'Other', domain: SQUARE }
    expect(modelOutsideDomain([GFS, HRRR, other], [BANFF])).toBe('NOAA HRRR')
  })

  it('holds nothing with no points', () => {
    expect(modelOutsideDomain([HRRR], [])).toBeNull()
  })
})

describe('analysisPoints', () => {
  const RING = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [-121.9, 47.4],
        [-121.7, 47.4],
        [-121.7, 47.55],
        [-121.9, 47.4],
      ] as [number, number][],
    ],
  }

  it('takes the ring vertices of a searched ring, then the list', () => {
    expect(analysisPoints(RING, true, [RAINIER])).toEqual([
      { latitude: 47.4, longitude: -121.9 },
      { latitude: 47.4, longitude: -121.7 },
      { latitude: 47.55, longitude: -121.7 },
      { latitude: 47.4, longitude: -121.9 },
      RAINIER,
    ])
  })

  // A ring with no type checked searches nothing.
  it('leaves out a ring nothing is searched for, and a missing ring', () => {
    expect(analysisPoints(RING, false, [RAINIER])).toEqual([RAINIER])
    expect(analysisPoints(null, true, [])).toEqual([])
  })

  // Conservative: a ring with a vertex outside is held, whatever it would find.
  it('holds a ring that reaches past the grid', () => {
    const reaching = {
      ...RING,
      coordinates: [
        [
          [-121.9, 47.4],
          [-115, 51.5],
          [-121.7, 47.55],
          [-121.9, 47.4],
        ] as [number, number][],
      ],
    }
    expect(modelOutsideDomain([HRRR], analysisPoints(reaching, true, []))).toBe('NOAA HRRR')
    expect(modelOutsideDomain([HRRR], analysisPoints(RING, true, []))).toBeNull()
  })
})
