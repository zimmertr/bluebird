import type { DestinationResult, HourlySeries } from '../types'
import type { WeatherResult } from '../utils/openMeteo'

// The one place a fake result row, hourly series or forecast answer is spelled
// out in full.
//
// Eleven suites used to carry their own twenty-line copy, so a new column on
// DestinationResult meant eleven edits and a forgotten one was a type error in
// whichever file was touched last. Here it is one edit, and the builder is
// typed against DestinationResult rather than cast, so a missing column fails
// this file alone.
//
// Vitest runs node-env with no DOM, so this module holds data and the types it
// is checked against and reaches into nothing else — no component, no hook.

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
    ...over,
  }
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
