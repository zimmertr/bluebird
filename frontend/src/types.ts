export type DestinationType = 'peak' | 'trailhead' | 'lake' | 'campground' | 'custom'

export type SortBy =
  | 'precip_total_in'
  | 'precip_max_in_hr'
  | 'wind_avg_mph'
  | 'wind_max_mph'
  | 'temp_avg_f'

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
}

export interface AnalyzeResponse {
  results: DestinationResult[]
  total_queried: number
  error?: string
}
