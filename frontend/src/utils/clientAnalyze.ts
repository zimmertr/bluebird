// The browser-side analysis pipeline (#170): everything POST /api/analyze
// does after discovery, ported so the SPA can attach forecasts itself via
// openMeteo.ts. Each helper is a deliberate port of its analyze.py
// counterpart (_merge_custom, _aligned_aqi, _assemble, _sort_key,
// _cap_detail) — behavior changes happen there first and get mirrored here,
// with the align cases pinned by the shared weather_vectors.json.

import {
  AnalyzeRequest,
  AnalyzeResponse,
  CustomDestination,
  DestinationResult,
  DiscoveredDestination,
  HourlySeries,
} from '../types'
import {
  AqiResult,
  Coordinate,
  WeatherResult,
  fetchAqi,
  fetchWeather,
} from './openMeteo'

// Mirror of MAX_ANALYZE_PEAKS in backend/app/models.py — keep them in sync
// (the MAX_POLYGON_AREA_KM2 precedent). The server enforces it on
// /api/destinations and /api/analyze; this copy covers the analyses that
// never touch the server at all (custom CSV / pins refresh).
export const MAX_ANALYZE_DESTINATIONS = 1_000

const NOUNS: Record<string, string> = {
  peak: 'peak',
  trailhead: 'trailhead',
  lake: 'lake',
  custom: 'destination',
}

export function analysisNoun(request: AnalyzeRequest): string {
  // A union (polygon + custom list) is a mixed set, so its messages say
  // "destinations" rather than any one type's noun — same rule as the routes.
  if (request.custom_destinations?.length) return 'destination'
  return NOUNS[request.destination_type] ?? 'destination'
}

// Port of _cap_detail: the over-cap refusal, advising only the remedies
// actually in play.
export function capDetail(
  count: number,
  noun: string,
  hasPolygon: boolean,
  hasCustom: boolean,
): string {
  const advice =
    hasPolygon && hasCustom
      ? 'Draw a smaller polygon, narrow the elevation range, or trim the custom list.'
      : hasPolygon
      ? 'Draw a smaller polygon or narrow the elevation range.'
      : 'Trim the custom list or narrow the elevation range.'
  return (
    `This search covers ${count.toLocaleString('en-US')} ${noun}s. The ` +
    `analysis limit is ${MAX_ANALYZE_DESTINATIONS.toLocaleString('en-US')}. ${advice}`
  )
}

// Port of _custom_dicts: a caller row in the same shape discovery produces.
export function customRows(custom: readonly CustomDestination[]): DiscoveredDestination[] {
  return custom.map((c) => ({
    name: c.name,
    type: 'custom',
    latitude: c.latitude,
    longitude: c.longitude,
    elevation_ft: c.elevation_ft ?? null,
    osm_id: null,
  }))
}

// Port of _coord_key. toFixed rounds ties away from zero where Python's
// format rounds half-even; the divergence could only matter when a custom
// and a discovered row sit at an exact 5th-decimal tie (~1 m), where the
// worst case is a duplicate row instead of a replacement.
function coordKey(d: { latitude: number; longitude: number }): string {
  return `${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`
}

// Port of _merge_custom: the union where the custom row wins a collision by
// exact name or by 5-decimal coordinate key.
export function mergeCustom(
  discovered: readonly DiscoveredDestination[],
  custom: readonly DiscoveredDestination[],
): DiscoveredDestination[] {
  const names = new Set(custom.map((c) => c.name))
  const coords = new Set(custom.map(coordKey))
  const kept = discovered.filter(
    (d) => !names.has(d.name) && !coords.has(coordKey(d)),
  )
  return [...kept, ...custom]
}

// Port of _aligned_aqi: AQI values on the weather grid, null where absent
// (the AQI horizon is ~5 days against weather's ~16).
export function alignAqi(
  timesMs: readonly number[],
  aqiSeries: { times: number[]; aqi: (number | null)[] } | null,
): (number | null)[] {
  if (!aqiSeries) return timesMs.map(() => null)
  const lookup = new Map<number, number | null>()
  aqiSeries.times.forEach((t, i) => lookup.set(t, aqiSeries.aqi[i] ?? null))
  return timesMs.map((t) => lookup.get(t) ?? null)
}

// Port of _canonical_times: the shared hourly grid is identical across
// destinations for one window, so the first row carrying a series defines it.
export function canonicalTimes(wxList: readonly WeatherResult[]): number[] {
  for (const wx of wxList) {
    if (wx?.series) return wx.series.times
  }
  return []
}

// Port of _sort_key: nullable AQI keys sort after every real value in either
// direction, so a null never wins a ranking. Ties compare equal, and JS sort
// is spec-stable, matching Python's.
export function rankComparator(
  field: keyof DestinationResult,
  desc: boolean,
): (a: DestinationResult, b: DestinationResult) => number {
  return (a, b) => {
    const av = a[field] as number | null | undefined
    const bv = b[field] as number | null | undefined
    const aNull = av == null
    const bNull = bv == null
    if (aNull || bNull) return Number(aNull) - Number(bNull)
    const ka = desc ? -av : av
    const kb = desc ? -bv : bv
    return ka < kb ? -1 : ka > kb ? 1 : 0
  }
}

// Port of _assemble: zip candidates with their weather + AQI, baking the
// hourly series (AQI aligned onto the weather grid) into each row. Rows
// whose weather came back null are dropped.
export function assemble(
  destinations: readonly DiscoveredDestination[],
  wxList: readonly WeatherResult[],
  aqiList: readonly AqiResult[],
): { results: DestinationResult[]; times: number[] } {
  const times = canonicalTimes(wxList)
  const results: DestinationResult[] = []
  for (let i = 0; i < destinations.length; i++) {
    const dest = destinations[i]
    const wx = wxList[i]
    if (!wx) continue
    const aqi = aqiList[i] ?? null
    const { series: wxSeries, ...aggregates } = wx
    let series: HourlySeries | null = null
    if (wxSeries) {
      series = {
        precip_in: wxSeries.precip_in,
        temp_f: wxSeries.temp_f,
        wind_mph: wxSeries.wind_mph,
        aqi: alignAqi(wxSeries.times, aqi?.series ?? null),
      }
    }
    results.push({
      name: dest.name,
      type: dest.type,
      latitude: dest.latitude,
      longitude: dest.longitude,
      elevation_ft: dest.elevation_ft,
      osm_id: dest.osm_id,
      ...aggregates,
      aqi_avg: aqi?.aqi_avg ?? null,
      aqi_max: aqi?.aqi_max ?? null,
      series,
    })
  }
  return { results, times }
}

export interface ClientAnalysisCallbacks {
  signal?: AbortSignal
  onStatus?: (message: string) => void
  onProgress?: (processed: number, total: number, message: string) => void
  // Injectable for tests (horizon clamp inside fetchAqi).
  nowMs?: number
}

// The client-side counterpart of the analyze routes' fetch-and-rank half:
// candidates in, ranked AnalyzeResponse out. Throws Error for conditions the
// server would refuse identically (cap, window problems) and
// OpenMeteoUnreachable when Open-Meteo itself cannot be reached — the one
// case useAnalyze retries via the server instead.
export async function runClientAnalysis(
  request: AnalyzeRequest,
  destinations: readonly DiscoveredDestination[],
  startMs: number,
  endMs: number,
  { signal, onProgress, nowMs }: ClientAnalysisCallbacks = {},
): Promise<AnalyzeResponse> {
  if (destinations.length === 0) {
    return { results: [], total_queried: 0 }
  }
  if (destinations.length > MAX_ANALYZE_DESTINATIONS) {
    throw new Error(
      capDetail(
        destinations.length,
        analysisNoun(request),
        request.destination_type !== 'custom',
        Boolean(request.custom_destinations?.length),
      ),
    )
  }

  const noun = analysisNoun(request)
  const coords: Coordinate[] = destinations.map((d) => ({
    latitude: d.latitude,
    longitude: d.longitude,
  }))

  const [wxList, aqiList] = await Promise.all([
    fetchWeather(coords, startMs, endMs, {
      signal,
      onProgress: (processed, total) =>
        onProgress?.(
          processed,
          total,
          // Byte-identical to the SSE progress copy, so both paths read alike.
          `Retrieving forecasts: ${processed} of ${total} ${noun}s…`,
        ),
    }),
    fetchAqi(coords, startMs, endMs, { signal, nowMs }),
  ])

  const { results, times } = assemble(destinations, wxList, aqiList)
  results.sort(
    rankComparator(request.sort_by ?? 'precip_total_in', request.sort_desc ?? false),
  )
  return {
    results: results.slice(0, request.limit),
    total_queried: destinations.length,
    times,
  }
}
