export type DestinationType = 'peak' | 'trailhead' | 'lake' | 'custom'

// One representative ranking value per metric (the backend enum accepts more
// aggregation keys for direct API callers, but the UI ranks by these four —
// direction is the second axis, carried separately as sortDesc/sort_desc).
export type SortBy =
  | 'precip_total_in'
  | 'wind_avg_mph'
  | 'temp_avg_f'
  | 'aqi_avg'

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
  destination_type: DestinationType
  start_datetime: string
  end_datetime: string
  limit: number
  sort_by?: SortBy
  sort_desc?: boolean
  custom_destinations?: CustomDestination[]
  // Elevation band, filtered server-side before the weather fetch
  min_elevation_ft?: number | null
  max_elevation_ft?: number | null
}

// Per-hour values over the analyzed window, aligned index-for-index to
// AnalyzeResponse.times. Nulls are gaps (a value missing at that hour, e.g. AQI
// past its ~5-day horizon) and render as breaks in the chart line.
export interface HourlySeries {
  precip_in: (number | null)[]
  temp_f: (number | null)[]
  wind_mph: (number | null)[]
  aqi: (number | null)[]
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
  precip_max_in_hr: number
  temp_min_f: number
  temp_max_f: number
  temp_avg_f: number
  wind_min_mph: number
  wind_max_mph: number
  wind_avg_mph: number
  // PM2.5 US AQI — null when the window is beyond the ~5-day air-quality
  // forecast horizon or the (best-effort) fetch failed
  aqi_avg: number | null
  aqi_max: number | null
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
  error?: string
  // Shared hourly grid for every row's `series`, epoch milliseconds (UTC),
  // rendered in the viewer's local time.
  times?: number[]
}
