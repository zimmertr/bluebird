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
    precip_min_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    aqi_avg: 121,
    aqi_min: 149,
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

  // ── Playback (#121) ────────────────────────────────────────────────────
  //
  // Scrubbing recolors the markers to one hour of the report. Row membership,
  // ranking and the table never move: this is marker presentation and nothing
  // else.

  const hourly = (overrides: Partial<DestinationResult> = {}) =>
    result({
      series: {
        // A dry hour, then a downpour, then dry again.
        precip_in: [0, 0.4, 0],
        temp_f: [50, 52, 51],
        wind_mph: [3, 30, 4],
        aqi: [40, null, 45],
        wind_dir_deg: [0, 90, null],
      },
      ...overrides,
    })

  it('colors a marker by the hour under the playhead, not by the window', () => {
    const dry = resultsFeatureCollection([hourly()], 'precip_total_in', true, 0)
    const wet = resultsFeatureCollection([hourly()], 'precip_total_in', true, 1)
    expect(dry.features[0].properties!.color).not.toBe(wet.features[0].properties!.color)
  })

  it('reads precipitation on the RATE scale during playback', () => {
    // 0.4 in one hour is a downpour and 0.4" over a window is not much rain.
    // Scoring the hour on the window scale would say they were the same
    // weather, which is the whole reason hourlyScale exists.
    const wet = resultsFeatureCollection([hourly()], 'precip_total_in', true, 1)
    const asWindowTotal = resultsFeatureCollection(
      [result({ precip_total_in: 0.4 })],
      'precip_total_in',
    )
    expect(wet.features[0].properties!.color).not.toBe(
      asWindowTotal.features[0].properties!.color,
    )
  })

  it('greys an hour with no value rather than scoring it as zero', () => {
    const props = resultsFeatureCollection([hourly()], 'aqi_avg', true, 1).features[0].properties!
    expect(props.color).toBe('#64748b')
  })

  it('points the wind arrow downwind, the way the wind is going', () => {
    // Open-Meteo reports the direction the wind blows FROM, so a 90° reading is
    // an easterly and the arrow points west.
    const props = resultsFeatureCollection([hourly()], 'wind_avg_mph', true, 1).features[0]
      .properties!
    expect(props.bearing).toBe(270)
  })

  it('omits the bearing where there is none, so the arrow layer draws nothing', () => {
    // A gap in the series, and a row from the SSE fallback which never fetched
    // direction at all. A 0 here would draw a confident arrow pointing north.
    const gap = resultsFeatureCollection([hourly()], 'wind_avg_mph', true, 2).features[0]
    expect(gap.properties!.bearing).toBeUndefined()
    const serverRow = resultsFeatureCollection(
      [hourly({ series: { precip_in: [0], temp_f: [50], wind_mph: [3], aqi: [40] } })],
      'wind_avg_mph',
      true,
      0,
    ).features[0]
    expect(serverRow.properties!.bearing).toBeUndefined()
  })

  it('carries no bearing at all when playback is off', () => {
    const props = resultsFeatureCollection([hourly()], 'wind_avg_mph').features[0].properties!
    expect(props.bearing).toBeUndefined()
  })

  it('omits the rank for unranked (searched) destinations', () => {
    const fc = resultsFeatureCollection(
      [result(), result({ name: 'Bandit Peak' })],
      'precip_total_in',
      false,
    )
    // No "#N" — searched destinations sit outside the sort and the limit.
    expect(fc.features.map((f) => f.properties!.rank)).toEqual(['', ''])
    // Still metric-colored like ranked results.
    expect(fc.features[0].properties!.color).not.toBe('#64748b')
  })
})
