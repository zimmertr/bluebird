import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  RefusalFields,
} from '../types'
import { AnalysisRefusalError, customRows, resolveCustomOnly, runClientAnalysis, withKnownTypes } from './clientAnalyze'
import type { LatePatch } from './clientAnalyze'
import { type IdentityMap, NO_IDENTITY, withIdentity, withLearnedElevation } from './elevationLookup'
import type { ElevationLookup } from '../hooks/useElevationLookup'
import { postDestinations } from './apiFetch'
import { resolveWindow, windowSource, type WindowLimits } from './forecastWindow'
import { comparedInPlay } from './model/modelSelection'
import { holdForecasts, reusableForecasts, type HeldForecasts } from './forecastReuse'

// One browser analysis from request to report. `clientAnalyze.ts` fetches,
// aggregates and ranks a field it is handed; this module is everything around
// that: it finds the field (discovery, or resolving a custom list), decides
// whether a held forecast may stand in, shapes each partial field for the
// screen, and merges the truncation discovery reported with the one the
// ranking applied. No React here: the hook that calls it owns the state.
//
// The primary path (#170): the browser does the analysis itself. The
// candidate list is the only server call (POST /api/destinations, answered
// from the pod's own copy of OpenStreetMap, or by one Overpass query on a
// deployment without it, #760), and the forecasts come straight from
// Open-Meteo on the visitor's own IP and quota, paced under it. Throws
// OpenMeteoUnreachable when the forecast API can't be reached (network/CORS);
// since #240 that fails the analysis with its own message, and nothing
// retries it through the pod's shared quota. A rate limit is NOT that class:
// the quota is per IP, and for a deployment sharing its egress with the
// visitor a same-IP retry only deepens the exhaustion (issue #180). Those
// surface honestly instead.

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
}

// A polygon run's one server call: what is in here? A run with no polygon
// never comes this way. Its field is the list it was sent, and
// `runAnalysisPipeline` resolves that list beside the forecasts instead
// (`resolveCustomOnly`, #643).
//
// `known` is what the browser's own lookup has learned about the reader's
// list (#673). The list rides with those elevations and with
// `elevation_lookup` off, so the pod answers its rows as sent rather than
// asking again about rows the lookup already placed, which on a deployment
// without the database is a second Overpass query in front of the run; a row
// still unknown takes the lookup's answer when it lands (`placeHeld`). The
// rows come back typed `custom` and without an OSM id, so what the lookup
// learned is put back on them here.
export async function discoverCandidates(
  request: AnalyzeRequest,
  signal: AbortSignal,
  known: IdentityMap = NO_IDENTITY,
): Promise<Discovered> {
  const customList = request.custom_destinations ?? []
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
    ...(customList.length
      ? { custom_destinations: withLearnedElevation(customList, known), elevation_lookup: false }
      : {}),
  }
  const discovered = await discoveryAnswer(await postDestinations(discoveryRequest, signal))
  return {
    candidates: withIdentity(discovered.destinations, known),
    totalFound: discovered.total_found ?? null,
    truncated: discovered.truncated ?? false,
  }
}

// The pod's answer to a destinations call, or the refusal or error it sent.
// A 422 is a refusal too, though its body carries no count (#803, D4): the
// pod validated the request and found it wrong, a list too long among the
// ways, so the same request is refused the same way and the Analyze button
// must not offer it again as `Try again`.
async function discoveryAnswer(res: Response): Promise<DestinationsResponse> {
  if (!res.ok) {
    const { message, refusal } = await readErrorBody(res)
    if (refusal || res.status === 422) throw new AnalysisRefusalError(message)
    throw new Error(message)
  }
  return (await res.json()) as DestinationsResponse
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
  // The field is known, before any forecast is fetched. A polygon run reports
  // it when discovery settles. A run with no polygon reports it at once, off
  // the request's own rows.
  onDiscovered: (found: Discovered) => void
  // What the browser's own lookup has learned about the rows (#673). A run
  // reads it as it starts and never waits for it: the list goes to the pod
  // with every elevation learned so far and with `elevation_lookup` off, so
  // the pod answers with the rows as sent, in milliseconds, and the rows
  // still unknown take their answer from that lookup when it lands.
  identity?: Pick<ElevationLookup, 'latest'>
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
  // The field a failed run of this same ring found (#782). A polygon run
  // handed one forecasts it rather than asking the pod again: the reader is
  // retrying the forecasts, and the ring, its kinds and its list have not
  // moved since. The caller decides that it still matches.
  found?: Discovered | null
  // Open-Meteo's hourly budget, which the run refuses to spend past once its
  // field is known and before any forecast is fetched (#803, D2), and how
  // models the chart compares beside the ranking one, whose weather the same
  // budget pays for. No budget, no check.
  hourlyCalls?: number
  compareModels?: readonly string[]
}

export interface PipelineResult {
  response: AnalyzeResponse
  // The full ranked field before the `limit` cut.
  field: DestinationResult[]
  // What the next run may reuse.
  held: HeldForecasts
  // The rows, by `geoKey`, whose elevation the lookup had not answered as the
  // report was assembled (#673). Empty when every row had one, or when the
  // run waited for the lookup.
  pending: ReadonlySet<string>
  // The lookup's answer, when it was still out as the report was assembled:
  // the rows it changed (each reduced again at its height) and the columns
  // still worth holding. Rejects only on abort.
  late: Promise<LatePatch> | null
}

export async function runAnalysisPipeline(request: AnalyzeRequest, options: PipelineOptions): Promise<PipelineResult> {
  const { signal, held, now = Date.now, onDiscovered, onPartial } = options
  const window = resolveWindow(request.start_datetime, request.end_datetime, now(), options.windowLimits)
  const asked = { ...window, model: request.forecast_model }
  const reuse = reusableForecasts(held, asked, now())

  const typed = (discovered: Discovered): Discovered => ({
    ...discovered,
    candidates: withKnownTypes(discovered.candidates, options.knownTypes ?? {}),
  })
  let found: Discovered
  let resolving: Promise<readonly DiscoveredDestination[]> | undefined
  if (request.polygon) {
    const known = options.identity?.latest() ?? NO_IDENTITY
    // A held field takes what the lookup has learned since it was found, as
    // a fresh answer would.
    found = typed(
      options.found
        ? { ...options.found, candidates: withIdentity(options.found.candidates, known) }
        : await discoverCandidates(request, signal, known),
    )
  } else {
    // A run with no polygon discovers nothing: its field is the list it was
    // sent, with the elevations the browser's own lookup has learned. So the
    // forecasts are asked for at once and the one server call runs beside
    // them (#643), and the report lands when the forecasts do (#673). The
    // call asks the pod for no
    // elevation lookup, so it answers in milliseconds whatever the map
    // server is doing; a row still unknown takes the browser's lookup's
    // answer when it lands. The one exception is an over-cap list keeping
    // its highest, which cannot choose without every elevation and so asks
    // the pod to look up what is still missing, the way every custom run
    // once did.
    const custom = request.custom_destinations ?? []
    const listed = { totalFound: null, truncated: false }
    const known = options.identity?.latest() ?? NO_IDENTITY
    found = typed({ ...listed, candidates: withIdentity(customRows(custom), known) })
    const lookup = (request.top_by_elevation ?? false) && custom.length > options.maxDestinations
    resolving = resolveCustomOnly(withLearnedElevation(custom, known), signal, lookup).then(
      (resolved) => typed({ ...listed, candidates: resolved.destinations }).candidates,
    )
  }
  onDiscovered(found)

  const { response, universe, aqiFailed, columns, late } = await runClientAnalysis(request, found.candidates, window.startMs, window.endMs, {
    signal,
    resolving,
    // The one clock the window and the reuse check above read, so the
    // fetches' horizon clamps cannot disagree with them.
    nowMs: now(),
    maxDestinations: options.maxDestinations,
    windowLimits: options.windowLimits,
    aqiForecastDays: options.aqiForecastDays,
    hourlyCalls: options.hourlyCalls,
    // None is fetched over an archive window (`comparedInPlay`, record 0235).
    comparedModels: comparedInPlay(
      options.compareModels ?? [],
      windowSource(window.startMs, window.endMs, now(), options.windowLimits),
    ).filter((id) => id !== request.forecast_model).length,
    reuse: reuse && { rows: reuse.rows, times: reuse.times, aqiFailed: reuse.aqiFailed, columns: reuse.columns },
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
    held: holdForecasts(reuse, universe, response.times ?? [], asked, now(), aqiFailed, columns),
    // Only while an answer is still coming: a run that waited for the lookup
    // holds the columns of the rows it could not place for a later run, and
    // those rows have nothing left to wait for.
    pending: late ? new Set(columns.keys()) : new Set(),
    late,
  }
}
