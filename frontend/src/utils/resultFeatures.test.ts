import { describe, it, expect } from 'vitest'
import { resultsFeatureCollection } from './resultFeatures'
import type { DestinationResult } from '../types'

function result(overrides: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name: 'Estes Butte Lookout Site',
    type: 'peak',
    latitude: 47.99505,
    longitude: -120.79303,
    elevation_ft: 5397,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    aqi_avg: 121,
    aqi_max: 149,
    ...overrides,
  }
}

describe('resultsFeatureCollection', () => {
  // The regression this guards: geometry read back from a clicked feature is
  // snapped to the tile grid, so the popup keys its fire-warning lookup (and
  // shows its coordinate readout) from these exact-coordinate properties.
  it('carries exact coordinates in properties', () => {
    const props = resultsFeatureCollection([result()], 'precip_total_in').features[0].properties!
    expect(props.lat).toBe(47.99505)
    expect(props.lon).toBe(-120.79303)
  })

  it('preserves full coordinate precision, not just five places', () => {
    const props = resultsFeatureCollection(
      [result({ latitude: 47.995051234, longitude: -120.793034567 })],
      'precip_total_in',
    ).features[0].properties!
    expect(props.lat).toBe(47.995051234)
    expect(props.lon).toBe(-120.793034567)
  })

  it('numbers ranks from 1 in array order', () => {
    const fc = resultsFeatureCollection([result(), result({ name: 'Bandit Peak' })], 'precip_total_in')
    expect(fc.features.map((f) => f.properties!.rank)).toEqual(['1', '2'])
  })

  it('greys a marker whose sort metric is null', () => {
    const props = resultsFeatureCollection([result({ aqi_avg: null })], 'aqi_avg').features[0].properties!
    expect(props.color).toBe('#64748b')
  })
})
