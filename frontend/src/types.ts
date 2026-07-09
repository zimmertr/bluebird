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
  // client-side constraints (not sent to backend)
  min_elevation_ft?: number | null
  max_elevation_ft?: number | null
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
}

export interface AnalyzeResponse {
  results: DestinationResult[]
  total_queried: number
  error?: string
}
