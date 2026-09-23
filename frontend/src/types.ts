export type DestinationType = 'peak' | 'trailhead' | 'lake' | 'custom'

// What polygon discovery can find. The UI's type picker offers only these:
// 'custom' is no longer a mode, just the wire form of a CSV-only request (and
// the per-row tag custom rows come back with).
export type DiscoveryType = Exclude<DestinationType, 'custom'>

// The panel's forecast selection is not mirrored here: it is a browser-side
// idea (a local calendar day) with no Pydantic counterpart, so it lives in
// utils/calendar.ts. On the wire an analysis is only ever two timestamps, and a
// point sample is start == end == the moment, which the backend normalizes to
// the hour containing it.

// Every aggregate column a result row carries, which since #291 is also every
// value the UI can rank by — the ranking picker pairs each metric with an
// aggregate dropdown, so this union mirrors the backend's SortBy enum member
// for member (direction is the second axis, carried separately as
// sortDesc/sort_desc). AQI has no minimum column, hence the one short family.
export type SortBy =
  | 'precip_total_in'
  | 'precip_avg_in_hr'
  | 'precip_min_in_hr'
  | 'precip_max_in_hr'
  | 'wind_min_mph'
  | 'wind_avg_mph'
  | 'wind_max_mph'
  | 'temp_min_f'
  | 'temp_avg_f'
  | 'temp_max_f'
  | 'freeze_min_ft'
  | 'freeze_avg_ft'
  | 'freeze_max_ft'
  // The one key that is not a window aggregate: snow depth is today's single
  // number, so its family has one member rather than three (#449).
  | 'snow_depth_in'
  | 'aqi_avg'
  | 'aqi_min'
  | 'aqi_max'
  // The cloud base and cloud cover (#117). Ranking by one is what makes an
  // analysis fetch the cloud variables at all.
  | 'cloud_base_min_ft'
  | 'cloud_base_avg_ft'
  | 'cloud_base_max_ft'
  | 'cloud_cover_min_pct'
  | 'cloud_cover_avg_pct'
  | 'cloud_cover_max_pct'

export interface GeoPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface CustomDestination {
  name: string
  latitude: number
  longitude: number
  elevation_ft?: number
}

export interface AnalyzeRequest {
  polygon?: GeoPolygon
  // A set, not a value: several types are discovered in one Overpass
  // query. Empty means discover nothing and analyze only
  // `custom_destinations`.
  destination_types: DiscoveryType[]
  // Also discover summits OSM knows only by their height. Off by
  // default: it roughly triples the candidate count.
  include_unnamed_peaks?: boolean
  start_datetime: string
  end_datetime: string
  // Which weather model answers. Required rather than optional: omitting it
  // would leave the browser path sending no `models=` and taking Open-Meteo's
  // unreported per-location blend, while the server path applied its own
  // default, so the two paths would disagree about what a number means.
  // `GET /api/capabilities` lists the accepted ids.
  forecast_model: string
  limit: number
  sort_by?: SortBy
  sort_desc?: boolean
  custom_destinations?: CustomDestination[]
  // Elevation band, filtered server-side before the weather fetch
  min_elevation_ft?: number | null
  max_elevation_ft?: number | null
  // Forecast bounds, applied after aggregation and before the ranking and the
  // limit cut. A ceiling compares the window's worst hour and a floor its best,
  // so a bound holds for every hour rather than for an average; precipitation
  // and AQI have no minimum aggregate, so both of their bounds compare
  // precip_total_in and aqi_max respectively. A null AQI or freezing level
  // passes either bound.
  //
  // Sent only on the SSE fallback path. The browser path holds the whole field
  // and applies these live through utils/present.ts, which is what makes them
  // knobs rather than another Analyze.
  min_precip_total_in?: number | null
  max_precip_total_in?: number | null
  min_temp_f?: number | null
  max_temp_f?: number | null
  min_wind_mph?: number | null
  max_wind_mph?: number | null
  min_freeze_ft?: number | null
  max_freeze_ft?: number | null
  min_snow_depth_in?: number | null
  max_snow_depth_in?: number | null
  min_aqi?: number | null
  max_aqi?: number | null
  min_cloud_base_ft?: number | null
  max_cloud_base_ft?: number | null
  min_cloud_cover_pct?: number | null
  max_cloud_cover_pct?: number | null
  // The server path's opt-in to the cloud fields on the returned rows. The
  // browser never sends it: it fetches the cloud column when the ranking or a
  // bound names a cloud metric, which it reads off the fields above.
  include_clouds?: boolean
  // Explicit opt-in: an over-limit candidate set keeps its highest-elevation
  // rows up to the analysis cap instead of refusing. The response then says
  // truncated: true with the pre-cut count in total_found — never silent.
  top_by_elevation?: boolean
}

// The body POST /api/destinations takes: the discovery half of an analysis,
// with nothing about forecasts on it.
//
// Spelled out rather than derived from AnalyzeRequest, and posted as a typed
// value rather than a bare object literal, because an unannotated literal is
// where a discovery knob goes missing without a word from the typecheck: a
// field absent from an untyped body is not a type error anywhere. api-compat.ts
// then binds this to the route's own schema.
export interface DestinationsRequest {
  polygon?: GeoPolygon | null
  destination_types: DiscoveryType[]
  include_unnamed_peaks?: boolean
  min_elevation_ft?: number | null
  max_elevation_ft?: number | null
  top_by_elevation?: boolean
  custom_destinations?: CustomDestination[]
}

// Per-hour values over the analyzed window, aligned index-for-index to
// AnalyzeResponse.times. Nulls are gaps (a value missing at that hour, e.g. AQI
// past its ~5-day horizon) and render as breaks in the chart line.
export interface HourlySeries {
  precip_in: (number | null)[]
  temp_f: (number | null)[]
  wind_mph: (number | null)[]
  // Feet above sea level. All null for the forecast models that do not
  // publish the variable, which is five of the eight (#295).
  freeze_ft: (number | null)[]
  aqi: (number | null)[]
  // Feet above sea level and percent (#117). Absent unless the analysis
  // fetched the cloud column, which it does only when asked for a cloud metric.
  cloud_base_ft?: (number | null)[] | null
  cloud_cover_pct?: (number | null)[] | null
  // Wind bearing in degrees clockwise from north, the direction the wind blows
  // FROM. Client-populated only: the backend does not fetch it, because nothing
  // it computes uses it, so a report from the SSE fallback carries none and the
  // map's playback arrows do not appear on that path. Same contract as
  // `series_times` below.
  wind_dir_deg?: (number | null)[]
}

export interface DestinationResult {
  name: string
  type: string
  latitude: number
  longitude: number
  elevation_ft: number | null
  osm_id: string | null
  precip_total_in: number
  precip_avg_in_hr: number
  precip_min_in_hr: number
  precip_max_in_hr: number
  temp_min_f: number
  temp_max_f: number
  temp_avg_f: number
  wind_min_mph: number
  wind_max_mph: number
  wind_avg_mph: number
  // Freezing level in feet above sea level, read against elevation_ft: below
  // the destination means the destination itself was below freezing that
  // hour, and 0 means the freezing level reached sea level. Null for every
  // row of an analysis run on a model that does not publish it (#295) — the
  // aggregation keeps it independent, so a null here says nothing about the
  // numbers above.
  freeze_min_ft: number | null
  freeze_max_ft: number | null
  freeze_avg_ft: number | null
  // US AQI (all EPA pollutants combined) — null when the window is beyond the ~5-day air-quality
  // forecast horizon or the (best-effort) fetch failed
  aqi_avg: number | null
  aqi_min: number | null
  aqi_max: number | null
  // Snow on the ground TODAY, in inches, from the NOHRSC SNODAS grid the pod
  // holds — not a forecast, and not a reading of the analyzed window at all
  // (#449). Null outside the grid, which covers the contiguous US and southern
  // Canada, and null while the pod holds no grid; both read N/A rather than as
  // a gap in the weather. Over permanent ice the model accumulates year over
  // year, so a glaciated summit reads over a thousand inches.
  snow_depth_in: number | null
  // The cloud base in feet above sea level and the cloud cover in percent,
  // each reduced over the window (#117). Null unless the analysis fetched the
  // cloud column, for a destination with no known elevation (the base only),
  // and for archive hours, which carry no pressure levels (the base only).
  cloud_base_min_ft: number | null
  cloud_base_avg_ft: number | null
  cloud_base_max_ft: number | null
  cloud_cover_min_pct: number | null
  cloud_cover_avg_pct: number | null
  cloud_cover_max_pct: number | null
  // Hourly series backing the comparison chart, aligned to AnalyzeResponse.times.
  series?: HourlySeries | null
  // Timestamps for `series` when the row came from its own analyze response
  // (pinned search forecasts) — absent for ranked rows, which share the
  // top-level times grid. Client-populated so the chart can align a pin's
  // series onto the active grid by timestamp; never sent by the API.
  series_times?: number[]
}

export interface AnalyzeResponse {
  results: DestinationResult[]
  total_queried: number
  // How many of those candidates satisfied the request's forecast bounds,
  // before the limit cut. Equal to total_queried when no bound was set, so the
  // footer can say "N of M matching" without knowing whether anything filtered.
  total_matched: number
  error?: string | null
  // Shared hourly grid for every row's `series`, epoch milliseconds (UTC),
  // rendered in the viewer's local time.
  times?: number[]
  // Pre-truncation candidate count when truncated is true; lets the header
  // caption an elected top-N honestly ("top 1,500 of 2,340").
  total_found?: number | null
  // True only when the request opted into top_by_elevation and the found set
  // exceeded the analysis cap.
  truncated?: boolean
  // Which day's SNODAS analysis every snow_depth_in above came from, as
  // YYYY-MM-DD. Null when the pod holds no grid, which is also when every
  // snow_depth_in is null.
  snow_analysis_date?: string | null
}

// Structured fields riding on an over-limit 400 (or the stream's error
// event) so the refusal panel can offer working remedies instead of a dead
// retry. Mirrors the backend's AnalysisRefusal model.
export interface RefusalFields {
  found?: number | null
  limit?: number | null
  suggested_min_elevation_ft?: number | null
  suggested_keeps?: number | null
}

// One candidate from POST /api/destinations: discovery without forecasts.
// The client-side analysis path attaches the weather itself (openMeteo.ts).
export interface DiscoveredDestination {
  name: string
  type: string
  latitude: number
  longitude: number
  elevation_ft: number | null
  osm_id: string | null
  // Today's snow depth, filled from the grid the pod holds. It arrives with
  // discovery rather than with the forecasts because it is not a forecast:
  // the browser path fetches its own weather and would otherwise never see it.
  snow_depth_in?: number | null
}

export interface DestinationsResponse {
  destinations: DiscoveredDestination[]
  total: number
  total_found?: number | null
  truncated?: boolean
  snow_analysis_date?: string | null
}
