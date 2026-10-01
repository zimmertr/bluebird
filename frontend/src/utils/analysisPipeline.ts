import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  RefusalFields,
} from '../types'
import { AnalysisRefusalError, resolveCustomOnly, runClientAnalysis, withKnownTypes } from './clientAnalyze'
import { postDestinations } from './apiFetch'
import { resolveWindow, type WindowLimits } from './forecastWindow'
import { holdForecasts, reusableForecasts, type HeldForecasts } from './forecastReuse'
import { requestsCloud } from './analysisSnapshot'

// One browser analysis from request to report. `clientAnalyze.ts` fetches,
// aggregates and ranks a field it is handed; this module is everything around
// that: it finds the field (discovery, or resolving a custom list), decides
// whether a held forecast may stand in, shapes each partial field for the
// screen, and merges the truncation discovery reported with the one the
// ranking applied. No React here: the hook that calls it owns the state.
//
// The primary path (#170): the browser does the analysis itself. The
// candidate list is the only server call (POST /api/destinations, one
// Overpass query), and the forecasts come straight from Open-Meteo on the
// visitor's own IP and quota, paced under it. Throws OpenMeteoUnreachable
// when the forecast API can't be reached (network/CORS); since #240 that
// fails the analysis with its own message, and nothing retries it through
// the pod's shared quota. A rate limit is NOT that class: the quota is per
// IP, and for a deployment sharing its egress with the visitor a same-IP
// retry only deepens the exhaustion (issue #180). Those surface honestly
// instead.

/**
 * What a discovery failure with no readable body says (#579, approved by the
 * maintainer 2026-10-01). The pod always answers with a `detail`, so a reply
 * without one was replaced on its way here: an edge proxy swaps the pod's
 * discovery 502 for a page of its own, and a 504 is a proxy's by definition
 * (docs/API.md). Both are the map service not answering, so they say so in
 * the pod's own sentence for it. Anything else is a failure nobody described,
 * in the pod's sentence for that. A bare "HTTP 502" was the reader's only
 * account before, against the copy rules in docs/STYLES.md.
 */
export const DISCOVERY_UNAVAILABLE_MESSAGE = 'OpenStreetMap is not available. Try again later.'
export const UNDESCRIBED_FAILURE_MESSAGE = 'Something went wrong. Try again later.'

// FastAPI validation errors (422) carry detail as an array of {msg, ...}
// objects rather than a string; over-limit 400s carry the structured
// AnalysisRefusal fields alongside detail. Flatten to one readable message
// plus whatever refusal fields rode along.
export async function readErrorBody(res: Response): Promise<{ message: string; refusal: RefusalFields | null }> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown } & RefusalFields
  const detail = body.detail
  const message =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail
            .map((d) => (d as { msg?: string }).msg ?? '')
            .filter(Boolean)
            .join('; ')
        : ''
  const refusal = body.found != null ? body : null
  const fallback =
    res.status === 502 || res.status === 504 ? DISCOVERY_UNAVAILABLE_MESSAGE : UNDESCRIBED_FAILURE_MESSAGE
  return { message: message || fallback, refusal }
}

/** The field an analysis will forecast, and what finding it reported. */
export interface Discovered {
  candidates: DiscoveredDestination[]
  // Server-side truncation, which happened at discovery.
  totalFound: number | null
  truncated: boolean
  // Which day's snow grid the field was matched against; null when none.
  snowAnalysisDate: string | null
}

// One server call answers two different questions. A polygon is *discovered*
// (what is in here?); a custom list is *resolved* (what does OSM know about
// these coordinates?), which is the only way a pasted CSV row can learn its
// elevation, since a coordinate pair carries none (issue #207).
export async function discoverCandidates(request: AnalyzeRequest, signal: AbortSignal): Promise<Discovered> {
  const customList = request.custom_destinations ?? []
  if (!request.polygon) {
    const resolved = await resolveCustomOnly(customList, signal)
    return { candidates: resolved.destinations, totalFound: null, truncated: false, snowAnalysisDate: resolved.snowAnalysisDate }
  }
  const discoveryRequest: DestinationsRequest = {
    polygon: request.polygon,
    destination_types: request.destination_types,
    // The client path is the only one (#240), so a discovery knob missing here
    // is a knob that does nothing at all.
    include_unnamed_peaks: request.include_unnamed_peaks ?? false,
    min_elevation_ft: request.min_elevation_ft,
    max_elevation_ft: request.max_elevation_ft,
    top_by_elevation: request.top_by_elevation ?? false,
    // The user's own list rides along with whatever discovery found: the union
    // proceeds even when the polygon itself found nothing. The server owns
    // this merge, because resolving those rows and merging them are one trip.
    ...(customList.length ? { custom_destinations: customList } : {}),
  }
  const res = await postDestinations(discoveryRequest, signal)
  if (!res.ok) {
    const { message, refusal } = await readErrorBody(res)
    if (refusal) throw new AnalysisRefusalError(message)
    throw new Error(message)
  }
  const discovered = (await res.json()) as DestinationsResponse
  return {
    candidates: discovered.destinations,
    totalFound: discovered.total_found ?? null,
    truncated: discovered.truncated ?? false,
    snowAnalysisDate: discovered.snow_analysis_date ?? null,
  }
}

export interface PipelineOptions {
  signal: AbortSignal
  // The field the last run fetched, which this run may reuse.
  held: HeldForecasts | null
  maxDestinations: number
  windowLimits: WindowLimits
  aqiForecastDays: number
  // Read at the start (the window and the reuse decision) and at the end (the
  // held field's clock). Injectable for tests.
  now?: () => number
  // Discovery settled: the field is known, before any forecast is fetched.
  onDiscovered: (found: Discovered) => void
  // The field so far, shaped as the report the screen shows. Its counts are a
  // floor: `total_queried` is what has been forecast so far.
  onPartial: (data: AnalyzeResponse, fieldSoFar: DestinationResult[]) => void
  onProgress: (processed: number, total: number, message: string) => void
  // The tail label, when air quality or the cloud column outlasts the weather.
  onTail?: (message: string) => void
  onPace: (seconds: number) => void
  // What the places the server answers as "custom" really are, by coordinate
  // (`knownTypes`, #545). Applied before anything reads a row's type.
  knownTypes?: Readonly<Record<string, string>>
}

export interface PipelineResult {
  response: AnalyzeResponse
  // The full ranked field before the `limit` cut.
  field: DestinationResult[]
  // What the next run may reuse.
  held: HeldForecasts
}

export async function runAnalysisPipeline(request: AnalyzeRequest, options: PipelineOptions): Promise<PipelineResult> {
  const { signal, held, now = Date.now, onDiscovered, onPartial } = options
  const window = resolveWindow(request.start_datetime, request.end_datetime, now(), options.windowLimits)
  const asked = { ...window, model: request.forecast_model }
  const reuse = reusableForecasts(held, asked, now())

  const discovered = await discoverCandidates(request, signal)
  const found = { ...discovered, candidates: withKnownTypes(discovered.candidates, options.knownTypes ?? {}) }
  onDiscovered(found)

  const { response, universe } = await runClientAnalysis(request, found.candidates, window.startMs, window.endMs, {
    signal,
    maxDestinations: options.maxDestinations,
    windowLimits: options.windowLimits,
    aqiForecastDays: options.aqiForecastDays,
    reuse: reuse && { rows: reuse.rows, times: reuse.times },
    cloud: requestsCloud(request),
    onPace: options.onPace,
    onPartial: (rows, times) =>
      onPartial(
        { results: rows.slice(0, request.limit), total_queried: rows.length, total_matched: rows.length, times },
        rows,
      ),
    onProgress: options.onProgress,
    onTail: options.onTail,
  })
  return {
    // Truncation at discovery or at the cap: either way the caption fields
    // win over per-path nulls.
    response: {
      ...response,
      total_found: response.total_found ?? found.totalFound,
      truncated: response.truncated || found.truncated,
    },
    field: universe,
    held: holdForecasts(reuse, universe, response.times ?? [], asked, now()),
  }
}
