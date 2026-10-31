import { describe, expect, it, vi } from 'vitest'

// The reduce at the ground's height is the one call that reads an elevation,
// so the suite watches it rather than building pressure levels to read.
const { reduceWeather, reduceCloud } = vi.hoisted(() => ({ reduceWeather: vi.fn(), reduceCloud: vi.fn() }))
vi.mock('./openMeteo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./openMeteo')>()),
  reduceWeather,
  reduceCloud,
}))

import { fetchedSeries, weatherResult } from '../testSupport/fixtures'
import type { HourlyPayload } from './openMeteoAggregate'
import { COVERAGE_PHRASE, OpenMeteoModelCoverage, TIMEOUT_MESSAGE, OpenMeteoTimeout } from './openMeteoErrors'
import { type PointFetches, pointFailure, pointForecast } from './pointForecast'

const AT = { lat: 48.79012, lon: -121.83211 }
const START = Date.UTC(2026, 9, 30, 18)
const W = { startMs: START, endMs: START + 59 * 60_000, model: 'gfs_seamless' }
const HOURS = [START]
const COLUMN = { hourly: { time: HOURS } } as unknown as HourlyPayload
const CLOUD_COLUMN = { hourly: { time: HOURS, relative_humidity_2m: [40] } } as unknown as HourlyPayload

/** Open-Meteo answering the one spot: its weather read at its terrain, no cloud, and air quality as given. */
function fetches({ aqiFailed = false, weather = true } = {}): PointFetches {
  return {
    fetchWeather: vi.fn<PointFetches['fetchWeather']>(async (_c, _s, _e, o) => {
      o?.onColumn?.(0, COLUMN)
      return [weather ? weatherResult({ temp_avg_f: 30, series: fetchedSeries({ times: HOURS, temp_f: [30] }) }) : null]
    }),
    fetchCloud: vi.fn<PointFetches['fetchCloud']>(async (_c, _s, _e, o) => {
      o?.onColumn?.(0, CLOUD_COLUMN)
      return [null]
    }),
    fetchAqi: vi.fn<PointFetches['fetchAqi']>(async () => ({ results: [aqiFailed ? null : { aqi_avg: 18, aqi_min: 18, aqi_max: 18, series: null }], failed: [aqiFailed] })),
  }
}

describe('pointForecast', () => {
  it("asks for the spot's three columns at once, read at the terrain until the ground is known", async () => {
    const f = fetches()
    await pointForecast(AT, Promise.resolve(null), W, new AbortController().signal, f)
    const coord = { latitude: AT.lat, longitude: AT.lon }
    expect(f.fetchWeather).toHaveBeenCalledWith([coord], W.startMs, W.endMs, expect.objectContaining({ model: W.model, terrainElevation: true }))
    expect(f.fetchCloud).toHaveBeenCalledWith([coord], W.startMs, W.endMs, expect.objectContaining({ model: W.model, terrainElevation: true }))
    expect(f.fetchAqi).toHaveBeenCalledWith([coord], W.startMs, W.endMs, expect.anything())
  })

  // The ground's height arrives beside the forecast, and the wind and the
  // temperature are read again there from the columns kept.
  it("reads the weather and the cloud again at the ground's height", async () => {
    reduceWeather.mockReturnValueOnce(weatherResult({ temp_avg_f: 21, series: fetchedSeries({ times: HOURS, temp_f: [21] }) }))
    reduceCloud.mockReturnValueOnce({ cloud_deck_min_ft: 9800, cloud_deck_avg_ft: 9800, cloud_deck_max_ft: 9800, series: null })
    const got = await pointForecast(AT, Promise.resolve(8412), W, new AbortController().signal, fetches())
    const placed = { latitude: AT.lat, longitude: AT.lon, elevation_ft: 8412 }
    expect(reduceWeather).toHaveBeenCalledWith(COLUMN, placed, W.startMs, W.endMs, { model: W.model, windowLimits: undefined })
    expect(reduceCloud).toHaveBeenCalledWith(CLOUD_COLUMN, placed, W.startMs, W.endMs, { model: W.model, windowLimits: undefined })
    expect(got?.row).toMatchObject({ temp_avg_f: 21, cloud_deck_avg_ft: 9800, elevation_ft: 8412, aqi_avg: 18 })
    expect(got?.row.series_times).toEqual(HOURS)
  })

  it('keeps the terrain read where the ground has no height', async () => {
    reduceWeather.mockClear()
    const got = await pointForecast(AT, Promise.resolve(null), W, new AbortController().signal, fetches())
    expect(reduceWeather).not.toHaveBeenCalled()
    expect(got?.row).toMatchObject({ temp_avg_f: 30, elevation_ft: null })
  })

  it('says which air quality failed, and that there is no weather for the hours', async () => {
    const failed = await pointForecast(AT, Promise.resolve(null), W, new AbortController().signal, fetches({ aqiFailed: true }))
    expect(failed?.aqiFailed).toBe(true)
    expect(await pointForecast(AT, Promise.resolve(null), W, new AbortController().signal, fetches({ weather: false }))).toBeNull()
  })
})

describe('pointFailure', () => {
  // The remedy is the panel's, and the card follows the analysis's model.
  it('says a model has no coverage without the remedy', () => {
    expect(pointFailure(new OpenMeteoModelCoverage('ncep_nbm_conus'), 'NOAA NBM')).toBe(`NOAA NBM ${COVERAGE_PHRASE}`)
  })

  it("passes every other failure's approved sentence through", () => {
    expect(pointFailure(new OpenMeteoTimeout(TIMEOUT_MESSAGE), 'NOAA GFS')).toBe(TIMEOUT_MESSAGE)
  })
})
