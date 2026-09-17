import { describe, expect, it } from 'vitest'
import { featureRow, pendingFC } from './mapFeatures'

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
