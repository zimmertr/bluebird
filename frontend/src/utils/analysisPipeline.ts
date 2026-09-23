import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  RefusalFields,
} from '../types'
import { AnalysisRefusalError, resolveCustomOnly, runClientAnalysis } from './clientAnalyze'
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
  return { message: message || `HTTP ${res.status}`, refusal }
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
  onPace: (seconds: number) => void
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

  const found = await discoverCandidates(request, signal)
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
