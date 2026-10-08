import type { DestinationResult, DiscoveredDestination, HourlySeries } from '../types'
import { type IdentityMap, NO_IDENTITY } from '../utils/elevationLookup'
import type { ElevationLookup } from '../hooks/useElevationLookup'
import type { AnalyzedView } from '../hooks/analyzeTypes'
import type { Capabilities, ForecastModelOption } from '../hooks/useCapabilities'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import type { Place } from '../utils/geocode'
import type { WeatherResult } from '../utils/openMeteo'
import type { WeatherSeries } from '../utils/openMeteoAggregate'
import type { CellBox, GridCell } from '../utils/forecastGridLattice'
import type { FireWarning } from '../utils/fireProximity'
import type { ClosureWarning } from '../utils/closureProximity'
import type { PendingDestination } from '../utils/customList'
import type { Feature, Geometry } from 'geojson'
import type { ClosureProps } from '../utils/closures'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'

// The one place a fake result row, hourly series or forecast answer is spelled
// out in full.
//
// Eleven suites used to carry their own twenty-line copy, so a new column on
// DestinationResult meant eleven edits and a forgotten one was a type error in
// whichever file was touched last. Here it is one edit, and the builder is
// typed against DestinationResult rather than cast, so a missing column fails
// this file alone.
//
// Both Vitest projects read it, the node one included, so this module holds
// data and the types it is checked against and reaches into nothing else: no
// component, no hook. Rendering helpers live in `render.tsx`, which only the
// DOM project loads.

/**
 * The `hourly_units` a real Open-Meteo weather answer declares for the units
 * every request asks for (measured 2026-10-01, on all eight models and the
 * archive). The aggregation refuses a number whose column declares anything
 * else (`checkUnits`), so a fake weather answer spreads this in.
 */
export const WEATHER_UNITS: Readonly<Record<string, string>> = {
  precipitation: 'inch',
  snowfall: 'inch',
  temperature_2m: '°F',
  wind_speed_10m: 'mp/h',
  ...Object.fromEntries([925, 850, 700, 600, 500].map((p) => [`wind_speed_${p}hPa`, 'mp/h'])),
  ...Object.fromEntries([925, 850, 700, 600, 500].map((p) => [`temperature_${p}hPa`, '°F'])),
}

/**
 * One location's answer to the cloud request (#670): the 2 m humidity and the
 * humidity at all eight levels, every one of them `rh`, so the column is dry
 * (and reads the deck's ceiling) unless a caller asks otherwise.
 */
export function cloudAnswer(times: string[], rh = 30): { hourly: Record<string, unknown> } {
  return {
    hourly: {
      time: times,
      relative_humidity_2m: times.map(() => rh),
      ...Object.fromEntries(
        [1000, 925, 850, 700, 600, 500, 400, 300].map((p) => [
          `relative_humidity_${p}hPa`,
          times.map(() => rh),
        ]),
      ),
    },
  }
}

/** Every hourly array, so a caller spells only the series it charts. */
export function series(over: Partial<HourlySeries> = {}): HourlySeries {
  return { precip_in: [], temp_f: [], wind_mph: [], freeze_ft: [], snowfall_in: [], aqi: [], ...over }
}

/**
 * One destination carrying every aggregate. The numbers are neutral — zero, or
 * null where the column is nullable — so a suite that needs to tell one column
 * from another supplies its own and an override reads as the thing under test.
 */
export function resultRow(over: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name: 'Mount Rainier',
    type: 'peak',
    latitude: 46.8523,
    longitude: -121.7603,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_min_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    freeze_min_ft: null,
    freeze_max_ft: null,
    freeze_avg_ft: null,
    aqi_avg: null,
    aqi_min: null,
    aqi_max: null,
    snowfall_total_in: null,
    snowfall_avg_in_hr: null,
    snowfall_min_in_hr: null,
    snowfall_max_in_hr: null,
    cloud_deck_min_ft: null,
    cloud_deck_avg_ft: null,
    cloud_deck_max_ft: null,
    ...over,
  }
}

/**
 * One forecast-grid sample. A lattice point rather than a destination, so it
 * carries the grid's own name and type, and a number on every metric the
 * raster and the arrows colour by, where `resultRow` would leave AQI null.
 */
export function gridRow(over: Partial<DestinationResult> = {}): DestinationResult {
  return resultRow({
    name: 'Forecast grid cell',
    type: 'grid',
    latitude: 46.5,
    longitude: -121.6,
    temp_min_f: 44.2,
    temp_max_f: 74.9,
    temp_avg_f: 62.1,
    wind_min_mph: 1,
    wind_max_mph: 10,
    wind_avg_mph: 6.4,
    aqi_avg: 30,
    aqi_min: 40,
    aqi_max: 40,
    ...over,
  })
}

/** One sampled cell. `index` is the VIRTUAL lattice index, never an array position. */
export function gridCell(box: CellBox, row: DestinationResult, index = 0): GridCell {
  return { index, box, row }
}

// `WeatherResult` is nullable, because a batch answers null for a location the
// model has no numbers for. A fake answer is never that one: a suite that wants
// the absence writes `null` at the call site, which is what its assertions read.
type PresentWeather = NonNullable<WeatherResult>

/**
 * One Open-Meteo answer for a location: every window aggregate, and no hourly
 * series. Neutral like `resultRow` — zero, or null where the aggregate is
 * nullable — so a suite spells the numbers its own assertions are measured
 * against and nothing else.
 */
export function weatherResult(over: Partial<PresentWeather> = {}): PresentWeather {
  return {
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_min_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    freeze_min_ft: null,
    freeze_max_ft: null,
    freeze_avg_ft: null,
    snowfall_total_in: null,
    snowfall_avg_in_hr: null,
    snowfall_min_in_hr: null,
    snowfall_max_in_hr: null,
    series: null,
    ...over,
  }
}

/**
 * The hourly half of one forecast answer, as `fetchWeather` hands it back on
 * `weatherResult`'s `series`: the hours it covers and a value per hour for each
 * variable. Empty unless a caller spells the hours its assertions read.
 */
export function fetchedSeries(over: Partial<WeatherSeries> = {}): WeatherSeries {
  return { times: [], precip_in: [], temp_f: [], wind_mph: [], freeze_ft: [], snowfall_in: [], ...over }
}

/**
 * One model the picker offers, as `/api/capabilities` publishes it. A global
 * model with no summary and no figures, so a suite names only the fields its
 * assertions read; `id` and `label` are the ones every caller overrides.
 */
export function forecastModel(over: Partial<ForecastModelOption> = {}): ForecastModelOption {
  return {
    id: 'gfs_seamless',
    label: 'NOAA GFS',
    summary: '',
    finestGridKm: 0,
    forecastHours: 384,
    regional: false,
    blend: false,
    ...over,
  }
}

/**
 * What `/api/capabilities` answers, as `useCapabilities` hands it over: one
 * model with a sixteen-day reach, and limits wide enough that nothing a test
 * does runs into them unless it asks to.
 */
export function capabilities(over: Partial<Capabilities> = {}): Capabilities {
  return {
    maxDestinations: 1500,
    maxLimit: 1500,
    maxPolygonAreaKm2: 100_000,
    maxPolygonPoints: MAX_POLYGON_POINTS,
    archiveDays: 365,
    aqiForecastDays: 5,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    forecastModels: [forecastModel()],
    defaultForecastModel: 'gfs_seamless',
    // No outlines, so no Layers row greys: a test that wants one says so.
    coverage: {},
    ...over,
  }
}

/**
 * One place the geocoder found, as the search box receives it. A peak with no
 * extent, elevation or OSM reference, which are the optional fields a pin reads
 * and the box itself never does.
 */
export function place(over: Partial<Place> = {}): Place {
  return {
    label: 'Mount Baker',
    description: 'Mount Baker, Whatcom County, Washington, United States',
    kind: 'peak',
    lat: 48.7768,
    lon: -121.8144,
    ...over,
  }
}

/**
 * The answer a fetch stub hands back where the network would.
 *
 * A real `Response` rather than an object literal, for the reason the
 * backend's `fake_response` is a real httpx one: the code reads `.ok`,
 * `.status` and `.json()` off it, and a hand-rolled double with `ok: true`
 * beside a 400 would make an error answer look healthy. A payload is sent as
 * JSON; `{ raw }` sends the text as it is, for a body that must not parse.
 * `headers` join the answer's own, for a refusal that carries a `Retry-After`.
 */
export function fakeResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const raw = typeof payload === 'object' && payload !== null && 'raw' in payload
  const body = raw ? String((payload as { raw: unknown }).raw) : JSON.stringify(payload)
  return new Response(body, { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

/**
 * One closure feature as `GET /api/closures` answers it: a closed trail
 * segment in the Columbia River Gorge, with the leading space the Forest
 * Service's own text carries, and both dates. A caller that wants a polygon or
 * a site passes its own geometry.
 */
export function closureFeature(
  over: Partial<ClosureProps> = {},
  geometry: Geometry = {
    type: 'LineString',
    coordinates: [
      [-121.9, 45.6],
      [-121.85, 45.62],
    ],
  },
): Feature<Geometry, ClosureProps> {
  return {
    type: 'Feature',
    geometry,
    properties: {
      OBJECTID: 7,
      ForestUnit: 'Columbia River Gorge NSA',
      District: null,
      FireName: 'Probe',
      ClosureOrderName: ' Probe Fire Closure',
      ClosureOrderNumber: '06-22-00-26-01',
      ClosureDescription: null,
      ClosureStartDate: Date.UTC(2026, 7, 1, 12),
      ClosureEndDate: Date.UTC(2026, 11, 31, 12),
      ClosureURLlink: 'https://www.fs.usda.gov/r06/alerts/probe',
      RouteName: ' Eagle Creek',
      RouteNum: '440',
      ...over,
    },
  }
}

/** One destination as `POST /api/destinations` answers it. */
export function discovered(over: Partial<DiscoveredDestination> = {}): DiscoveredDestination {
  return {
    name: 'Probe',
    type: 'peak',
    latitude: 47.45,
    longitude: -121.8,
    elevation_ft: 5000,
    osm_id: 'node/1',
    ...over,
  }
}

/**
 * One nearest-fire warning, as the fire lookup keys it to a row: a named fire
 * a few miles off, centred close by.
 */
export function fireWarning(over: Partial<FireWarning> = {}): FireWarning {
  return { miles: 3.2, name: 'Probe Fire', latitude: 46.3, longitude: -121.5, ...over }
}

/**
 * One closure warning, as the closure lookup keys it to a row: a named order
 * with a page of its own, centred close by.
 */
export function closureWarning(over: Partial<ClosureWarning> = {}): ClosureWarning {
  return {
    name: 'Probe Fire Closure',
    url: 'https://www.fs.usda.gov/r06/alerts/probe',
    latitude: 45.6,
    longitude: -121.9,
    ...over,
  }
}

/**
 * One custom destination awaiting its first analysis. A searched place, so it
 * carries the remove button a CSV row lacks; a suite that needs the CSV case
 * overrides `source`.
 */
export function pendingDestination(over: Partial<PendingDestination> = {}): PendingDestination {
  return { name: 'Probe Peak', latitude: 47.1, longitude: -121.2, elevation_ft: 6000, source: 'search', ...over }
}

/** The snapshot of one committed report: days from 6:00 to 18:00 UTC on
 * 2026-07-20, ranked by precipitation, with nothing custom covered. */
export function analyzedSnapshot(over: Partial<AnalyzedView> = {}): AnalyzedView {
  return {
    sortBy: 'precip_total_in',
    sortDesc: false,
    limit: 200,
    constraints: NO_CONSTRAINTS,
    kind: 'days',
    window: { startMs: Date.UTC(2026, 6, 20, 6), endMs: Date.UTC(2026, 6, 20, 18) },
    windowSource: 'forecast',
    customKeys: new Set(),
    forecastModel: 'gfs_seamless',
    polygonKey: '',
    typesKey: '',
    compareModels: [],
    cloudFetched: false,
    ...over,
  }
}

/**
 * The paste-time elevation lookup as a test hands it to an analysis (#673):
 * what it knows, as of now and of the last render alike, with nothing still
 * being asked about.
 */
export function elevationLookup(identity: IdentityMap = NO_IDENTITY): ElevationLookup {
  return { identity, latest: () => identity, inquiring: new Set() }
}
