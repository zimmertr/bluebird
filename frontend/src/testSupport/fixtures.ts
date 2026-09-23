import type { DestinationResult, HourlySeries } from '../types'
import type { ForecastModelOption } from '../hooks/useCapabilities'
import type { Place } from '../utils/geocode'
import type { WeatherResult } from '../utils/openMeteo'
import type { CellBox, GridCell } from '../utils/forecastGridLattice'

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

/** Every hourly array, so a caller spells only the series it charts. */
export function series(over: Partial<HourlySeries> = {}): HourlySeries {
  return { precip_in: [], temp_f: [], wind_mph: [], freeze_ft: [], aqi: [], ...over }
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
    snow_depth_in: null,
    cloud_base_min_ft: null,
    cloud_base_avg_ft: null,
    cloud_base_max_ft: null,
    cloud_cover_min_pct: null,
    cloud_cover_avg_pct: null,
    cloud_cover_max_pct: null,
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
    series: null,
    ...over,
  }
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
