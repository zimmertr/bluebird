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
// never touch the server at all (custom CSV / pins refresh) and is the
// fallback when /api/capabilities has not answered yet.
export const MAX_ANALYZE_DESTINATIONS = 1_500

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
// actually in play, plus the computed elevation-floor suggestion when one
// exists.
export function capDetail(
  count: number,
  noun: string,
  hasPolygon: boolean,
  hasCustom: boolean,
  suggestion?: { floorFt: number; keeps: number } | null,
  cap: number = MAX_ANALYZE_DESTINATIONS,
): string {
  const advice =
    hasPolygon && hasCustom
      ? 'Draw a smaller polygon, narrow the elevation range, or trim the custom list.'
      : hasPolygon
      ? 'Draw a smaller polygon or narrow the elevation range.'
      : 'Trim the custom list or narrow the elevation range.'
  let detail =
    `This search covers ${count.toLocaleString('en-US')} ${noun}s. The ` +
    `analysis limit is ${cap.toLocaleString('en-US')} destinations. ${advice}`
  if (suggestion) {
    detail +=
      ` Setting a minimum elevation of ${suggestion.floorFt.toLocaleString('en-US')} ft ` +
      `would keep about ${suggestion.keeps.toLocaleString('en-US')} ${noun}s.`
  }
  return detail
}

// Port of _suggest_elevation_floor: a minimum elevation that would bring the
// candidate count under `cap`, or null when none can (unknown elevations
// always pass elevation filters, so too many unknowns make a floor useless).
// Rounded up to the next 100 ft; rounding up only ever keeps fewer rows, so
// the suggestion always actually works.
export function suggestElevationFloor(
  destinations: readonly { elevation_ft: number | null }[],
  cap: number,
): { floorFt: number; keeps: number } | null {
  const unknowns = destinations.filter((d) => d.elevation_ft == null).length
  const budget = cap - unknowns
  if (budget <= 0) return null
  const known = destinations
    .map((d) => d.elevation_ft)
    .filter((e): e is number => e != null)
    .sort((a, b) => b - a)
  if (known.length <= budget) return null
  const threshold = known[budget - 1]
  const floorFt = Math.ceil(threshold / 100) * 100
  const keeps = unknowns + known.filter((e) => e >= floorFt).length
  return { floorFt, keeps }
}

// Port of _truncate_top_elevation: the explicit opt-in cut. Unknown
// elevations are dropped first (they cannot claim to be among the highest);
// never called without the user's election.
export function truncateTopElevation<T extends { elevation_ft: number | null }>(
  destinations: readonly T[],
  cap: number,
): T[] {
  return destinations
    .filter((d) => d.elevation_ft != null)
    .sort((a, b) => (b.elevation_ft as number) - (a.elevation_ft as number))
    .slice(0, cap)
}

// Thrown by the client-only paths (custom CSV / pins refresh) for an
// over-limit set, carrying the same remedy fields the server's structured
// 400 does, so the refusal panel renders identically on every path.
export class AnalysisRefusalError extends Error {
  found: number
  limit: number
  suggestedMinElevationFt: number | null
  suggestedKeeps: number | null
  constructor(
    message: string,
    found: number,
    limit: number,
    suggestion: { floorFt: number; keeps: number } | null,
  ) {
    super(message)
    this.found = found
    this.limit = limit
    this.suggestedMinElevationFt = suggestion ? suggestion.floorFt : null
    this.suggestedKeeps = suggestion ? suggestion.keeps : null
  }
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
  // The pacer (or a minutely resume) is about to wait this many seconds.
  onPace?: (seconds: number) => void
  // Injectable for tests (horizon clamp inside fetchAqi).
  nowMs?: number
  // The live analysis cap from /api/capabilities; the compiled constant is
  // the fallback so a failed capabilities fetch never blocks analyzing.
  maxDestinations?: number
}

// The client-side counterpart of the analyze routes' fetch-and-rank half:
// candidates in, ranked AnalyzeResponse out. Throws AnalysisRefusalError for
// an over-limit set (with remedy fields), plain Error for conditions the
// server would refuse identically, and lets openMeteo.ts's typed errors
// (Unreachable / RateLimited / HttpError) propagate — the CALLER decides
// which of those justifies the server fallback.
export async function runClientAnalysis(
  request: AnalyzeRequest,
  destinations: readonly DiscoveredDestination[],
  startMs: number,
  endMs: number,
  { signal, onProgress, onPace, nowMs, maxDestinations }: ClientAnalysisCallbacks = {},
): Promise<AnalyzeResponse> {
  if (destinations.length === 0) {
    return { results: [], total_queried: 0 }
  }
  const cap = maxDestinations ?? MAX_ANALYZE_DESTINATIONS
  const noun = analysisNoun(request)
  let candidates = destinations
  let totalFound: number | null = null
  let truncated = false
  if (candidates.length > cap) {
    if (request.top_by_elevation) {
      totalFound = candidates.length
      candidates = truncateTopElevation(candidates, cap)
      truncated = true
    } else {
      const suggestion = suggestElevationFloor(candidates, cap)
      throw new AnalysisRefusalError(
        capDetail(
          candidates.length,
          noun,
          request.destination_type !== 'custom',
          Boolean(request.custom_destinations?.length),
          suggestion,
          cap,
        ),
        candidates.length,
        cap,
        suggestion,
      )
    }
  }

  const coords: Coordinate[] = candidates.map((d) => ({
    latitude: d.latitude,
    longitude: d.longitude,
  }))

  // One controller spans every fetch this analysis makes: the first fatal
  // failure aborts the rest, so no in-flight or queued batch keeps spending
  // the visitor's quota after the outcome is already decided (the incident's
  // zombie batches, issue #180). Linked to the caller's signal so Cancel
  // still aborts everything.
  const internal = new AbortController()
  const onCallerAbort = () => internal.abort()
  if (signal?.aborted) internal.abort()
  signal?.addEventListener('abort', onCallerAbort, { once: true })

  try {
    const sortBy = request.sort_by ?? 'precip_total_in'
    const aqiSort = sortBy.startsWith('aqi')

    // Weather first — it is the ranking input. AQI is fetched for every
    // candidate only when it IS the ranking key; otherwise it is display
    // data and is attached to just the returned rows below, which is the
    // difference between ~2N and ~N weighted calls on the visitor's quota.
    const wxList = await fetchWeather(coords, startMs, endMs, {
      signal: internal.signal,
      onPace,
      onProgress: (processed, total) =>
        onProgress?.(
          processed,
          total,
          // Byte-identical to the SSE progress copy, so both paths read alike.
          `Retrieving forecasts: ${processed} of ${total} ${noun}s…`,
        ),
    })
    const aqiList: AqiResult[] = aqiSort
      ? await fetchAqi(coords, startMs, endMs, { signal: internal.signal, nowMs })
      : new Array(candidates.length).fill(null)

    const { results, times } = assemble(candidates, wxList, aqiList)
    results.sort(rankComparator(sortBy, request.sort_desc ?? false))
    const top = results.slice(0, request.limit)

    if (!aqiSort && top.length > 0) {
      const topCoords = top.map((r) => ({ latitude: r.latitude, longitude: r.longitude }))
      const aqiTop = await fetchAqi(topCoords, startMs, endMs, {
        signal: internal.signal,
        nowMs,
      })
      top.forEach((row, i) => {
        const aqi = aqiTop[i]
        if (!aqi) return
        row.aqi_avg = aqi.aqi_avg
        row.aqi_max = aqi.aqi_max
        if (row.series) row.series.aqi = alignAqi(times, aqi.series ?? null)
      })
    }

    return {
      results: top,
      total_queried: candidates.length,
      times,
      total_found: totalFound,
      truncated,
    }
  } catch (e) {
    internal.abort()
    throw e
  } finally {
    signal?.removeEventListener('abort', onCallerAbort)
  }
}
