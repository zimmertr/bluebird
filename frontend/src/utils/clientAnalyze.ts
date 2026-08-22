// The browser-side analysis pipeline (#170): everything POST /api/analyze
// does after discovery, ported so the SPA can attach forecasts itself via
// openMeteo.ts. Each helper is a deliberate port of its analyze.py
// counterpart (_aligned_aqi, _assemble, _sort_key, _cap_detail) — behavior
// changes happen there first and get mirrored here, with the align cases
// pinned by the shared weather_vectors.json.
//
// _merge_custom has no port here. Custom rows are now resolved server-side
// on the way in (issue #207), and the same trip returns them already merged
// with whatever discovery found, so a second union in the browser would only
// be a chance for the two to disagree.

import {
  AnalyzeRequest,
  AnalyzeResponse,
  CustomDestination,
  DestinationResult,
  DestinationsResponse,
  DiscoveredDestination,
  HourlySeries,
} from '../types'
import { pinKey } from './customList'
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
  // Port of _noun: a specific noun only when the set holds exactly one
  // kind, because "1,842 peaks" beats "1,842 destinations"; anything mixed
  // merges rather than listing types, since a refusal is read for its
  // remedy and an inventory buries that.
  const kinds = new Set(request.destination_types)
  if (request.custom_destinations?.length || kinds.size !== 1) return 'destination'
  return NOUNS[[...kinds][0]] ?? 'destination'
}

// Port of _cap_detail: the over-cap refusal states what is wrong, and
// nothing else. It used to advise the remedies in play and quote the
// computed elevation floor; TJ removed both (2026-08-22, #253's PR), and the
// server's copy dropped them in the same change.
export function capDetail(
  count: number,
  noun: string,
  cap: number = MAX_ANALYZE_DESTINATIONS,
): string {
  return (
    `This search covers ${count.toLocaleString('en-US')} ${noun}s. The ` +
    `analysis limit is ${cap.toLocaleString('en-US')} destinations.`
  )
}

// Port of _filter_elevation. Unknown elevations pass through: many OSM peaks
// carry no `ele` tag, and dropping them would make narrowing the band look
// like destinations were vanishing.
//
// The band is normally applied server-side at discovery, so this exists for
// the one case the server cannot answer: narrowing the band over a field the
// browser already holds, which is a subset of it and needs no refetch (#188).
// Keeping it a port rather than a lookalike is what makes that subset match
// what the server would have returned for the narrower band.
export function filterElevation<T extends { elevation_ft: number | null }>(
  destinations: readonly T[],
  minFt: number | null,
  maxFt: number | null,
): readonly T[] {
  if (minFt === null && maxFt === null) return destinations
  return destinations.filter((d) => {
    const elev = d.elevation_ft
    if (elev == null) return true
    if (minFt !== null && elev < minFt) return false
    return !(maxFt !== null && elev > maxFt)
  })
}

/**
 * The forecast bounds an analysis is narrowed by, mirroring the eight optional
 * fields on `AnalyzeRequest`.
 *
 * Elevation is deliberately NOT in here. It is known before any forecast
 * exists, so it gates what gets fetched and widening it needs a new analysis
 * (`Band` and `bandNarrows` in present.ts). Nothing in this shape can gate a
 * fetch — a destination's precipitation is unknowable until it has been
 * fetched — which is exactly what makes every one of these live.
 */
export interface Constraints {
  minPrecipTotalIn: number | null
  maxPrecipTotalIn: number | null
  minTempF: number | null
  maxTempF: number | null
  minWindMph: number | null
  maxWindMph: number | null
  minAqi: number | null
  maxAqi: number | null
}

export const NO_CONSTRAINTS: Constraints = {
  minPrecipTotalIn: null,
  maxPrecipTotalIn: null,
  minTempF: null,
  maxTempF: null,
  minWindMph: null,
  maxWindMph: null,
  minAqi: null,
  maxAqi: null,
}

// Which result field each bound compares — the port of _LOWER_BOUNDS and
// _UPPER_BOUNDS in analyze.py, and the whole of the design.
//
// A ceiling reads the window's worst hour and a floor its best, so a bound is
// a promise about every hour rather than about an average that can hide a bad
// afternoon: a 20 mph ceiling admits no destination that gusts to 45 at noon.
// Precipitation and AQI have no minimum aggregate to read — a per-hour
// precipitation floor would be 0.000 almost everywhere — so both of their
// bounds compare one field, and the panel labels those two rows with the table
// column they compare so the screen says which.
const LOWER_BOUNDS = [
  ['minPrecipTotalIn', 'precip_total_in'],
  ['minTempF', 'temp_min_f'],
  ['minWindMph', 'wind_min_mph'],
  ['minAqi', 'aqi_max'],
] as const satisfies readonly (readonly [keyof Constraints, keyof DestinationResult])[]

const UPPER_BOUNDS = [
  ['maxPrecipTotalIn', 'precip_total_in'],
  ['maxTempF', 'temp_max_f'],
  ['maxWindMph', 'wind_max_mph'],
  ['maxAqi', 'aqi_max'],
] as const satisfies readonly (readonly [keyof Constraints, keyof DestinationResult])[]

/** Is any bound set? Decides whether the count line mentions matching at all. */
export function hasConstraints(c: Constraints): boolean {
  return Object.values(c).some((v) => v !== null)
}

/** The bounds a request carries, as the panel and `present.ts` name them. */
export function constraintsFromRequest(request: AnalyzeRequest): Constraints {
  return {
    minPrecipTotalIn: request.min_precip_total_in ?? null,
    maxPrecipTotalIn: request.max_precip_total_in ?? null,
    minTempF: request.min_temp_f ?? null,
    maxTempF: request.max_temp_f ?? null,
    minWindMph: request.min_wind_mph ?? null,
    maxWindMph: request.max_wind_mph ?? null,
    minAqi: request.min_aqi ?? null,
    maxAqi: request.max_aqi ?? null,
  }
}

/** The bounds as the wire fields `AnalyzeRequest` names them. */
export function constraintFields(c: Constraints) {
  return {
    min_precip_total_in: c.minPrecipTotalIn,
    max_precip_total_in: c.maxPrecipTotalIn,
    min_temp_f: c.minTempF,
    max_temp_f: c.maxTempF,
    min_wind_mph: c.minWindMph,
    max_wind_mph: c.maxWindMph,
    min_aqi: c.minAqi,
    max_aqi: c.maxAqi,
  }
}

/**
 * Port of _filter_constraints: drop rows outside the forecast bounds.
 *
 * A null value passes every bound. Only AQI can be null here, and a missing
 * AQI means the window outran the ~5-day air-quality horizon or a best-effort
 * fetch failed. Neither is evidence that the air is bad, and dropping those
 * rows would quietly empty every long-window analysis that set a ceiling — the
 * same call `filterElevation` makes for an untagged summit and `rankComparator`
 * makes for a nullable ranking key.
 */
export function filterConstraints(
  rows: readonly DestinationResult[],
  c: Constraints,
): readonly DestinationResult[] {
  const lower = LOWER_BOUNDS.filter(([k]) => c[k] !== null)
  const upper = UPPER_BOUNDS.filter(([k]) => c[k] !== null)
  if (lower.length === 0 && upper.length === 0) return rows
  return rows.filter((r) => {
    for (const [k, field] of lower) {
      const v = r[field] as number | null
      if (v != null && v < (c[k] as number)) return false
    }
    for (const [k, field] of upper) {
      const v = r[field] as number | null
      if (v != null && v > (c[k] as number)) return false
    }
    return true
  })
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

// Thrown for an over-limit set, by the client-only paths and by the server's
// structured 400 alike. The type is the signal: it routes the message to the
// refusal box rather than the error box, because a deterministic refusal
// retried verbatim can only repeat itself. The remedies ride in the message
// prose (`capDetail`); the server's structured remedy fields stay on the API
// for direct callers, and the SPA reads none of them.
export class AnalysisRefusalError extends Error {}

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

// The custom-only analysis path's one server call: what does OSM know about
// these coordinates? A pasted CSV row carries a name and a point and nothing
// else, so this is the only way it can learn its elevation (issue #207).
//
// Deliberately a nicety rather than a dependency. The elevation band and the
// destination cap both run client-side already, so nothing here is load
// bearing, and every failure path returns the rows unresolved — which is
// exactly how this path behaved before, when it made no server call at all.
// An abort is the exception: that is the user's own doing and has to
// propagate rather than masquerade as a resolved-nothing result.
export async function resolveCustomOnly(
  custom: readonly CustomDestination[],
  signal?: AbortSignal,
): Promise<DiscoveredDestination[]> {
  const rows = customRows(custom)
  // Nothing to ask about: an empty list, or a list whose every row already
  // knows its elevation. The second case is the pins-only refresh, where each
  // searched place carries Nominatim's answer — so that path still reaches no
  // server at all, exactly as it did before this call existed. The server
  // makes the same check; this one keeps the round trip itself from happening.
  if (!rows.length || rows.every((r) => r.elevation_ft != null)) return rows
  try {
    const res = await fetch('/api/destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination_types: [],
        custom_destinations: custom,
      }),
      signal,
    })
    if (!res.ok) return rows
    const body = (await res.json()) as DestinationsResponse
    // A short answer means the server dropped rows this path never asked it
    // to drop, so trust the list we already hold over a surprising one.
    return body.destinations?.length === rows.length ? body.destinations : rows
  } catch (err) {
    if (signal?.aborted) throw err
    return rows
  }
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
        // Present only on the browser path, which is the only one that asks
        // Open-Meteo for it. Spread rather than assigned so a row from a
        // response without it carries no key at all, rather than an explicit
        // undefined the map would have to distinguish from an empty array.
        ...(wxSeries.wind_dir_deg ? { wind_dir_deg: wxSeries.wind_dir_deg } : {}),
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
  // Forecasts the browser already holds, to be reused for any candidate that
  // appears in both. Widening the elevation band is the case this exists for:
  // it readmits destinations this report never fetched, but it does not
  // invalidate the ones already in hand, and re-fetching those spent the
  // visitor's Open-Meteo quota to learn what was already on screen.
  //
  // The CALLER owns the question of whether reuse is legal — identical window
  // and model, and recent enough — because it is the only layer that knows
  // when the held rows were fetched (`FORECAST_REUSE_MS` in useAnalyze.ts).
  // Passing rows from a different window here would silently mix two
  // forecasts into one report.
  reuse?: { rows: readonly DestinationResult[]; times: readonly number[] } | null
}

export interface ClientAnalysis {
  // What the table shows: ranked and cut to `limit`, the wire shape the server
  // routes return.
  response: AnalyzeResponse
  // Every candidate that got a forecast, ranked by the same key, BEFORE the
  // cut. Weather is fetched for the whole field anyway (exact ranking demands
  // it), so this costs nothing to keep and is what makes a later window change
  // exact instead of a re-rank of whatever happened to be on screen (#177),
  // and what lets sort/limit/elevation-narrowing re-present the field with no
  // second Analyze (#188, `utils/present.ts`).
  //
  // Every row carries every metric, air quality included, so any of the four
  // rankings can be applied to the whole field later. The first `limit`
  // entries are the SAME objects as `response.results`, not copies; nothing
  // mutates a row after this returns.
  universe: DestinationResult[]
}

// The client-side counterpart of the analyze routes' fetch-and-rank half:
// candidates in, ranked AnalyzeResponse out. Throws AnalysisRefusalError for
// an over-limit set (with remedy fields), plain Error for conditions the
// server would refuse identically, and lets openMeteo.ts's typed errors
// (Unreachable / RateLimited / HttpError) propagate to the caller.
export async function runClientAnalysis(
  request: AnalyzeRequest,
  destinations: readonly DiscoveredDestination[],
  startMs: number,
  endMs: number,
  { signal, onProgress, onPace, nowMs, maxDestinations, reuse }: ClientAnalysisCallbacks = {},
): Promise<ClientAnalysis> {
  if (destinations.length === 0) {
    return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [] }
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
      throw new AnalysisRefusalError(capDetail(candidates.length, noun, cap))
    }
  }

  // Split the field into what is already forecast and what still has to be
  // fetched. With no reusable rows this is the whole list and the analysis runs
  // exactly as it always has.
  //
  // A reused row keeps its forecast but takes its identity from the fresh
  // candidate: discovery may have learned an elevation since (a pasted
  // coordinate resolved against OSM), and the forecast is the expensive half,
  // not the name.
  const heldRows = new Map<string, DestinationResult>()
  for (const r of reuse?.rows ?? []) heldRows.set(pinKey(r.latitude, r.longitude), r)
  const reused: DestinationResult[] = []
  const unforecast: DiscoveredDestination[] = []
  for (const d of candidates) {
    const hit = heldRows.get(pinKey(d.latitude, d.longitude))
    if (hit) {
      reused.push({
        ...hit,
        name: d.name,
        type: d.type,
        elevation_ft: d.elevation_ft,
        osm_id: d.osm_id,
      })
    } else {
      unforecast.push(d)
    }
  }

  const coords: Coordinate[] = unforecast.map((d) => ({
    latitude: d.latitude,
    longitude: d.longitude,
    // The fetch adjusts wind to this height (issue #257); a lattice point
    // in useForecastGrid sends none and keeps the 10 m wind.
    elevation_ft: d.elevation_ft,
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

    // AQI rides ALONGSIDE weather for the whole field rather than trailing the
    // ranking for the displayed rows. Open-Meteo bills weighted calls per
    // SERVICE, and air quality has its own 600/min quota (openMeteo.ts), so
    // this spends a bucket the weather fetch cannot touch, and the two waits
    // overlap instead of stacking — measurably cheaper in wall clock than the
    // lazy version it replaces, whose tail batch was a second serialized pace.
    // It is also what lets an AQI ranking be a live presentation knob: sorting
    // the held field by air quality needs air quality for all of it (#188).
    //
    // The server path stays lazy (#181). There the budget is the pod's, shared
    // across visitors, so the same arithmetic comes out the other way.
    // Nothing new to forecast: every candidate came out of the held field, so
    // the analysis is a re-rank and costs no upstream call at all.
    let fetched: DestinationResult[] = []
    let times: number[] = []
    if (coords.length > 0) {
      const aqiPending = fetchAqi(coords, startMs, endMs, {
        signal: internal.signal,
        nowMs,
      })
        // fetchAqi only ever throws AbortError, which is what a weather failure
        // (or Cancel) triggers below. Swallow it here so it cannot surface as an
        // unhandled rejection once the caller has already taken the real error.
        .catch((): AqiResult[] => new Array(coords.length).fill(null))
      const wxList = await fetchWeather(coords, startMs, endMs, {
        signal: internal.signal,
        onPace,
        model: request.forecast_model,
        onProgress: (processed, total) =>
          onProgress?.(
            processed,
            total,
            // Byte-identical to the analyze route's progress copy, so the
            // app and a direct API caller read alike.
            `Retrieving forecasts: ${processed} of ${total} ${noun}s…`,
          ),
      })
      const aqiList = await aqiPending
      const assembled = assemble(unforecast, wxList, aqiList)
      fetched = assembled.results
      times = assembled.times
    }

    // The hourly grid is a property of the window, not of a fetch, and reuse is
    // only ever legal within one window. So the held grid stands in when this
    // analysis fetched nothing, and the two are the same grid either way.
    if (times.length === 0) times = [...(reuse?.times ?? [])]

    const results = [...reused, ...fetched]
    results.sort(rankComparator(sortBy, request.sort_desc ?? false))
    const top = results.slice(0, request.limit)

    return {
      response: {
        results: top,
        total_queried: candidates.length,
        // Nothing is filtered here. The browser holds the whole field and
        // applies the forecast bounds live in present.ts, which is what makes
        // them a knob rather than another Analyze; the two counts only differ
        // for direct callers of the server route, which sends trimmed rows.
        total_matched: candidates.length,
        times,
        total_found: totalFound,
        truncated,
      },
      universe: results,
    }
  } catch (e) {
    internal.abort()
    throw e
  } finally {
    signal?.removeEventListener('abort', onCallerAbort)
  }
}

// The destinations a refresh re-analyzes: the held universe, so a window
// change re-ranks the field the analysis actually saw rather than the handful
// the last cut left on screen (#177). The displayed-rows fallback survives
// only as null-tolerance: since #240 every committed report holds its field,
// so a refresh without one cannot happen.
//
// Removals have to be applied here explicitly. Echoing the displayed rows used
// to drop ×-removed destinations as a side effect of them already being gone
// from the display; the universe never saw the removal.
export function refreshEchoRows(
  universe: readonly DestinationResult[] | null,
  displayed: readonly DestinationResult[],
  removedKeys: ReadonlySet<string>,
): CustomDestination[] {
  return (universe ?? displayed)
    .filter((r) => !removedKeys.has(pinKey(r.latitude, r.longitude)))
    .map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      elevation_ft: r.elevation_ft ?? undefined,
    }))
}
