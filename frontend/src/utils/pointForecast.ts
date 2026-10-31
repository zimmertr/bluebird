import type { DestinationResult } from '../types'
import { assemble } from './clientAnalyze'
import type { WindowLimits } from './forecastWindow'
import {
  type Coordinate,
  fetchAqi,
  fetchCloud,
  fetchWeather,
  reduceCloud,
  reduceWeather,
} from './openMeteo'
import type { HourlyPayload } from './openMeteoAggregate'
import { COVERAGE_PHRASE, OpenMeteoModelCoverage } from './openMeteoErrors'
import { coordinateLabel } from './points'

// The forecast a right-click card shows for its spot (#832): one location's
// weather, cloud deck and air quality, assembled into the row shape a ranked
// marker's card reads, so the card draws it through the same grid.

/** The window and model the card forecasts: the last analysis's, else the panel's. */
export interface PointWindow {
  startMs: number
  endMs: number
  model: string
  windowLimits?: WindowLimits
  aqiForecastDays?: number
}

/** What the card draws once the fetches settle. */
export interface PointForecast {
  row: DestinationResult
  /** Whether the air quality failed, which its cells say as N/A rather than a dash. */
  aqiFailed: boolean
}

/** The fetches, injectable so a test runs none. */
export interface PointFetches {
  fetchWeather: typeof fetchWeather
  fetchCloud: typeof fetchCloud
  fetchAqi: typeof fetchAqi
}

const LIVE: PointFetches = { fetchWeather, fetchCloud, fetchAqi }

/**
 * Fetches the spot's forecast while `elevationFt` is still on its way, and
 * reads the wind and the temperature at that height once it lands: the
 * Mapterhorn elevation under the pointer, which is the height the card's
 * facts line states. Open-Meteo is never sent an elevation, so the request
 * need not wait for it; the columns are kept (`onColumn`) and reduced again
 * at the height. Where the height never comes (no tile, a failed fetch), the
 * spot is read at Open-Meteo's own terrain height for the coordinate, as the
 * forecast grid's lattice points are (#288).
 *
 * Resolves null where the model has no weather for the hours asked. A failed
 * weather or cloud fetch rejects, as it fails an analysis; air quality is
 * best-effort here as everywhere.
 */
export async function pointForecast(
  at: { lat: number; lon: number },
  elevationFt: Promise<number | null>,
  w: PointWindow,
  signal: AbortSignal,
  fetches: PointFetches = LIVE,
): Promise<PointForecast | null> {
  const coord: Coordinate = { latitude: at.lat, longitude: at.lon }
  const shared = { model: w.model, windowLimits: w.windowLimits, terrainElevation: true, signal }
  // The raw columns, filled as each lands, for the reduce at the height.
  const columns: { weather?: HourlyPayload; cloud?: HourlyPayload } = {}
  const [wxList, cloudList, air, ft] = await Promise.all([
    fetches.fetchWeather([coord], w.startMs, w.endMs, {
      ...shared,
      onColumn: (_, column) => {
        columns.weather = column
      },
    }),
    fetches.fetchCloud([coord], w.startMs, w.endMs, {
      ...shared,
      onColumn: (_, column) => {
        columns.cloud = column
      },
    }),
    fetches.fetchAqi([coord], w.startMs, w.endMs, { signal, aqiForecastDays: w.aqiForecastDays }),
    elevationFt,
  ])
  let wx = wxList[0] ?? null
  let cloud = cloudList[0] ?? null
  if (ft !== null) {
    const placed: Coordinate = { ...coord, elevation_ft: ft }
    const reduce = { model: w.model, windowLimits: w.windowLimits }
    if (columns.weather) wx = reduceWeather(columns.weather, placed, w.startMs, w.endMs, reduce)
    if (columns.cloud) cloud = reduceCloud(columns.cloud, placed, w.startMs, w.endMs, reduce)
  }
  const { results, times } = assemble(
    [
      {
        name: coordinateLabel(at.lat, at.lon),
        type: 'custom',
        latitude: at.lat,
        longitude: at.lon,
        elevation_ft: ft,
        osm_id: null,
      },
    ],
    [wx],
    [air.results[0] ?? null],
    [cloud],
  )
  const row = results[0]
  if (!row) return null
  return { row: { ...row, series_times: times }, aqiFailed: air.failed[0] ?? false }
}

/**
 * The line a failed forecast leaves on the card: the message the analysis
 * would show for the same failure, each already an approved sentence, except
 * that a model with no coverage says so without the remedy. Switching the
 * model is the panel's, and the card follows the last analysis's (TJ,
 * 2026-10-30), as a compared model's line does (`useModelCompare.ts`).
 */
export function pointFailure(e: unknown, modelLabel: string): string {
  if (e instanceof OpenMeteoModelCoverage) return `${modelLabel} ${COVERAGE_PHRASE}`
  return e instanceof Error ? e.message : String(e)
}
