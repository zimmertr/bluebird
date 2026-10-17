import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_UPSTREAMS, resetUpstreams, setUpstreams, styleUrl, upstreams } from './upstreams'

// What a stack on the supplier simulator publishes (sim/compose.yml).
const SIM = {
  open_meteo_forecast: 'http://localhost:8080/open-meteo/v1/forecast',
  open_meteo_archive: 'http://localhost:8080/open-meteo/v1/archive',
  open_meteo_air_quality: 'http://localhost:8080/open-meteo/v1/air-quality',
  map_tiles: 'http://localhost:8080/tiles',
  radar: 'http://localhost:8080/radar',
  snow: 'http://localhost:8080/snow',
}

afterEach(() => resetUpstreams())

describe('the upstream hosts', () => {
  it('starts on the production hosts', () => {
    expect(upstreams()).toBe(DEFAULT_UPSTREAMS)
    expect(DEFAULT_UPSTREAMS).toEqual({
      openMeteoForecast: 'https://api.open-meteo.com/v1/forecast',
      openMeteoArchive: 'https://archive-api.open-meteo.com/v1/archive',
      openMeteoAirQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
      mapTiles: 'https://tiles.openfreemap.org',
      radar: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0',
      snow: 'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer',
    })
    expect(styleUrl()).toBe('https://tiles.openfreemap.org/styles/liberty')
  })

  it('takes every member the pod publishes', () => {
    setUpstreams(SIM)
    expect(upstreams()).toEqual({
      openMeteoForecast: SIM.open_meteo_forecast,
      openMeteoArchive: SIM.open_meteo_archive,
      openMeteoAirQuality: SIM.open_meteo_air_quality,
      mapTiles: SIM.map_tiles,
      radar: SIM.radar,
      snow: SIM.snow,
    })
    expect(styleUrl()).toBe('http://localhost:8080/tiles/styles/liberty')
  })

  // A pod on an older build publishes no `upstreams`, and a member that is
  // missing or malformed must not leave a fetch with no base.
  it('keeps the production host for each member it cannot read', () => {
    setUpstreams({ map_tiles: SIM.map_tiles, radar: 42, snow: '', open_meteo_forecast: null })
    expect(upstreams()).toEqual({ ...DEFAULT_UPSTREAMS, mapTiles: SIM.map_tiles })
    for (const garbage of [undefined, null, 'http://localhost:8080', [SIM.map_tiles]]) {
      setUpstreams(garbage)
      expect(upstreams()).toEqual(DEFAULT_UPSTREAMS)
    }
  })

  it('reads each member by its wire name alone', () => {
    setUpstreams({ mapTiles: SIM.map_tiles, openMeteoForecast: SIM.open_meteo_forecast })
    expect(upstreams()).toEqual(DEFAULT_UPSTREAMS)
  })

  it('starts each answer from the production hosts, not from the last one', () => {
    setUpstreams(SIM)
    setUpstreams({ radar: SIM.radar })
    expect(upstreams()).toEqual({ ...DEFAULT_UPSTREAMS, radar: SIM.radar })
  })

  it('goes back to the production hosts on reset', () => {
    setUpstreams(SIM)
    resetUpstreams()
    expect(upstreams()).toBe(DEFAULT_UPSTREAMS)
  })
})
