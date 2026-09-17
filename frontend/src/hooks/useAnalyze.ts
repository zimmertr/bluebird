import { useRef, useState } from 'react'
import {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationsRequest,
  DestinationsResponse,
  DiscoveredDestination,
  RefusalFields,
} from '../types'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { resolveWindow, windowSource, type WindowSource } from '../utils/forecastWindow'
import {
  AnalysisRefusalError,
  MAX_ANALYZE_DESTINATIONS,
  constraintsFromRequest,
  resolveCustomOnly,
  runClientAnalysis,
} from '../utils/clientAnalyze'
import { postDestinations } from '../utils/apiFetch'
import { pinKey } from '../utils/customList'
import { COVERAGE_MESSAGE_TAIL, OpenMeteoModelCoverage } from '../utils/openMeteo'
import { SelectionKind } from '../utils/calendar'
import { AnalyzedSnapshot, discoveryKeys } from '../utils/present'
import type { ForecastModelOption } from './useCapabilities'

export type Progress = {
  processed: number
  total: number
  percent: number
}

// How long a held forecast may stand in for a fresh one. Mirrors the per-
// location forecast TTL in backend/app/services/cache.py: past it the server
// would refetch rather than serve its copy, so reusing here would hand the
// visitor numbers their own pod has already retired.
const FORECAST_REUSE_MS = 15 * 60 * 1000

// An over-limit refusal, normalized from whichever path produced it (the
// server's structured 400 or the client-only paths' AnalysisRefusalError).
// Drives the warn box instead of the error box, with no retry action: a
// deterministic refusal retried verbatim can only repeat itself, and the
// message already names the remedies in prose. The server's structured
// remedy fields stay on the API for direct callers; the SPA renders none of
// them (removed with #253's PR at TJ's request, 2026-08-22).
export type Refusal = {
  message: string
}

// The data snapshot behind the current response: the window it sampled, and
// the presentation knobs it was requested with.
//
// The knobs are recorded so the live ones can be compared against them, which
// is how `utils/present.ts` decides whether the display can be re-derived from
// the held field or genuinely needs another Analyze (#188). Sort and limit
// are re-derived live, so this copy of them is history rather than the
// display source.
// Composes PresentationKnobs rather than restating them, so the recorded set
// and the compared set cannot drift apart.
export type AnalyzedView = AnalyzedSnapshot & {
  // Which arm of the forecast selection this was: the current hour, or chosen
  // days. A data knob — unlike sort and limit it is never re-derived, so it
  // always reads from here — and it decides only wording, since 'now' is the one
  // shape whose caption says when it was taken rather than what was asked for.
  kind: SelectionKind
  // The window as requested, epoch ms. Everything the display used to read off a
  // mode name is derived from this instead: whether the analysis was a point
  // sample (`isPointSample`, which counts hourly stamps rather than trusting a
  // label), and the range the results header states. Recorded off the request
  // like `customKeys` below, so it is path-independent.
  window: { startMs: number; endMs: number }
  // Which Open-Meteo endpoint answered this report. Classified ONCE, here,
  // beside the window it was classified from — the same discipline the routes
  // follow on the server — because the boundary is relative to `now`: a report
  // re-classified later could change endpoints while it sits on screen. The
  // forecast grid reads it to decide whether it may sample at all, since an
  // archive report has no model pitch to sample at (#123).
  windowSource: WindowSource
  // The custom destinations this analysis covered — searched places and pasted
  // CSV rows, by pinKey. Recorded off the request rather than read back off the
  // results, which are cut to `limit` and so cannot answer "was this analyzed?"
  // for a field bigger than the cut (#205).
  customKeys: ReadonlySet<string>
  // The model that produced every number in the field. A data knob like the
  // window, and recorded for the same reason: the panel's model can move
  // afterwards, and when it does the held rows are not stale so much as
  // answers to a different question.
  forecastModel: string
  // The discovery inputs behind the field, as `discoveryKeys` spells them:
  // which ring was searched, and for which kinds. Recorded so the panel can
  // ask whether the drawn polygon and checked types are still the ones this
  // report's discovery ran with. Derived off the request by default; the
  // weather-only refresh path carries no polygon in its request and passes
  // the panel's keys explicitly instead.
  polygonKey: string
  typesKey: string
  // The extra models the chart's comparison was bought for (#232). Recorded for
  // the same reason as `forecastModel`: the panel's ticks can move afterwards,
  // and a model ticked since is one the browser holds no forecasts for. Ticking
  // therefore cues a commit and unticking applies at once: the held field can
  // always answer a smaller question and never a larger one.
  compareModels: readonly string[]
}

/**
 * What an analysis needs recording about it that its request cannot say.
 *
 * An object rather than two more positional arguments: both fields are
 * optional and both are strings-or-arrays, so a caller that swapped them would
 * type-check.
 */
export interface AnalyzeOptions {
  /**
   * The discovery identity this run answers for, when the request cannot say
   * it: the weather-only refresh re-fetches a polygon report through the custom
   * path, so its request carries no polygon.
   */
  discovery?: { polygonKey: string; typesKey: string }
  /** The extra models the chart's comparison is buying forecasts for (#232). */
  compareModels?: readonly string[]
}

// FastAPI validation errors (422) carry detail as an array of {msg, ...}
// objects rather than a string; over-limit 400s carry the structured
// AnalysisRefusal fields alongside detail. Flatten to one readable message
// plus whatever refusal fields rode along.
async function readErrorBody(
  res: Response,
): Promise<{ message: string; refusal: RefusalFields | null }> {
  const body = (await res.json().catch(() => ({}))) as {
    detail?: unknown
  } & RefusalFields
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

export function useAnalyze(
  maxDestinations: number = MAX_ANALYZE_DESTINATIONS,
  models: readonly ForecastModelOption[] = [],
) {
  const [loading, setLoading] = useState(false)
  // True between the first batch landing and the analysis finishing: the rows
  // on screen are a floor, not the report (#337, finding 2). The results bar
  // says "so far" while it holds.
  const [arriving, setArriving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  // The full ranked field behind `response`, before the `limit` cut. Null
  // only before the first committed analysis: since #240 removed the server
  // SSE fallback, every path that commits a report also holds its field.
  const [universe, setUniverse] = useState<DestinationResult[] | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  // Bumped once per committed analysis. See commit().
  const [analysisSeq, setAnalysisSeq] = useState(0)
  // The wildfire check's field, published the moment discovery settles so the
  // NIFC lookup runs concurrently with the weather fetch instead of after it
  // (TJ, PR #275 review). It is the candidate list, a superset of the
  // committed universe (the bounds and the cap cut later), which is
  // safe: warnings are keyed by coordinate, so an extra point's warning never
  // matches a row. `fireSeq` is the check's own refetch trigger, bumped when
  // the field is published — keying the check on analysisSeq would abort the
  // in-flight lookup at commit and restart it, serial again. Null when the
  // last analysis failed; callers fall back to the committed field.
  const [fireField, setFireField] = useState<{ latitude: number; longitude: number }[] | null>(
    null,
  )
  const [fireSeq, setFireSeq] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  // When the client pacer is sleeping off a quota deficit, the wall-clock
  // moment it resumes — the overlay renders a live countdown from this.
  const [paceEndMs, setPaceEndMs] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<{
    request: AnalyzeRequest
    kind: SelectionKind
    options: AnalyzeOptions
  } | null>(null)
  // The discovery identity of the analysis in flight, for commit() to record.
  // A ref rather than a commit() parameter because commit is reached through
  // the client pipeline, and the identity is fixed the moment analyze() runs.
  const pendingDiscoveryRef = useRef(discoveryKeys(null, [], false))
  // The comparison the analysis in flight is buying, for commit() to record —
  // a ref for the same reason as the discovery identity above: it is fixed the
  // moment analyze() runs, and commit is reached through the client pipeline.
  const pendingCompareRef = useRef<readonly string[]>([])
  // The forecasts the last browser analysis fetched, kept so the next one only
  // pays for what it does not already have. It helps any re-analysis at the
  // same window and model — a pasted destination, a toggled unnamed-peaks, a
  // redrawn ring that still covers most of the old one — because reuse is
  // decided per destination rather than per reason, and re-buying a forecast
  // already on screen spends the visitor's Open-Meteo quota to learn nothing.
  const heldForecastsRef = useRef<{
    rows: DestinationResult[]
    times: number[]
    startMs: number
    endMs: number
    model: string
    fetchedAtMs: number
  } | null>(null)

  // Abort the in-flight request. The fetch loops swallow AbortError so no
  // error banner shows — the user chose to stop.
  function cancel() {
    abortRef.current?.abort()
  }

  // Re-run the most recent request (used by the "Try again" button on
  // transient errors; a deterministic refusal gets no retry, because run
  // verbatim it can only repeat itself).
  function retry() {
    if (lastRequestRef.current)
      analyze(
        lastRequestRef.current.request,
        lastRequestRef.current.kind,
        lastRequestRef.current.options,
      )
  }

  // Clear the current ranked results without fetching. Used by a pins-only
  // Analyze so a stale ranking (e.g. from a since-deleted polygon) doesn't
  // linger in the table and on the map above the refetched pins.
  function reset() {
    setResponse(null)
    setUniverse(null)
    setArriving(false)
    setAnalyzed(null)
    setError(null)
    setRefusal(null)
    setFireField(null)
    lastRequestRef.current = null
    heldForecastsRef.current = null
  }

  // `universe` is required rather than defaulted: a path that cannot supply the
  // full field has to say so at the call site, since silently passing the
  // trimmed rows as the universe is exactly the #177 bug.
  function commit(
    data: AnalyzeResponse,
    request: AnalyzeRequest,
    kind: SelectionKind,
    fullField: DestinationResult[],
  ) {
    setResponse(data)
    setUniverse(fullField)
    setArriving(false)
    recordSnapshot(request, kind)
    // A fresh report, which is not the same event as a fresh row array: live
    // knobs rebuild the rows constantly. Surfaces that reset per report (the
    // table's detail-column sort) key off this rather than off the rows.
    //
    // Deliberately NOT bumped by the arriving commits below. It restarts the
    // forecast grid's fetch and resets the table's detail sort, and doing
    // either thirty times over one analysis would be a different feature.
    setAnalysisSeq((n) => n + 1)
  }

  /**
   * The field so far, while the rest of it is still being fetched (#337).
   *
   * Everything a live knob reads is set: the rows, the held field, and the
   * snapshot that says what was asked for. What is not set is `analysisSeq`,
   * for the reason above.
   */
  function commitArriving(
    data: AnalyzeResponse,
    request: AnalyzeRequest,
    kind: SelectionKind,
    fieldSoFar: DestinationResult[],
  ) {
    setResponse(data)
    setUniverse(fieldSoFar)
    setArriving(true)
    recordSnapshot(request, kind)
  }

  function recordSnapshot(request: AnalyzeRequest, kind: SelectionKind) {
    const startMs = Date.parse(request.start_datetime)
    const endMs = Date.parse(request.end_datetime)
    setAnalyzed({
      sortBy: request.sort_by ?? 'precip_total_in',
      sortDesc: request.sort_desc ?? false,
      limit: request.limit,
      constraints: constraintsFromRequest(request),
      kind,
      window: { startMs, endMs },
      windowSource: windowSource(startMs, endMs),
      customKeys: new Set(
        (request.custom_destinations ?? []).map((d) => pinKey(d.latitude, d.longitude)),
      ),
      forecastModel: request.forecast_model,
      polygonKey: pendingDiscoveryRef.current.polygonKey,
      typesKey: pendingDiscoveryRef.current.typesKey,
      compareModels: pendingCompareRef.current,
    })
  }

  function handlePace(seconds: number) {
    setPaceEndMs(Date.now() + seconds * 1000)
  }

  // The primary path (#170): the browser does the analysis itself. The
  // candidate list is the only server call — POST /api/destinations, one
  // Overpass query — and the forecasts come straight from Open-Meteo on the
  // visitor's own IP and quota, paced under it. Throws OpenMeteoUnreachable
  // when the forecast API can't be reached (network/CORS); since #240 that
  // fails the analysis with its own message, and nothing retries it through
  // the pod's shared quota. A rate limit is NOT that class: the quota is per
  // IP, and for a deployment sharing its egress with the visitor a same-IP
  // retry only deepens the exhaustion (issue #180) — those surface honestly
  // instead.
  //
  // That one call answers two different questions. A polygon is *discovered*
  // (what is in here?); a custom list is *resolved* (what does OSM know about
  // these coordinates?) — which is the only way a pasted CSV row can learn
  // its elevation, since a coordinate pair carries none (issue #207).
  async function analyzeViaClient(
    request: AnalyzeRequest,
    kind: SelectionKind,
    signal: AbortSignal,
  ): Promise<void> {
    const { startMs, endMs } = resolveWindow(request.start_datetime, request.end_datetime)

    // Reuse is legal only where a held forecast answers the same question:
    // the same resolved window (which is why this compares the RESOLVED pair —
    // "now" floors to its containing hour, so two analyses in one hour ask the
    // same thing) and the same model, recently enough that the numbers are not
    // ones the server's own cache would already have refetched.
    //
    // The clock runs from the FIRST fetch, not the last, so a field cannot be
    // kept alive indefinitely by re-analyzing every fourteen minutes.
    const held = heldForecastsRef.current
    const reuse =
      held !== null &&
      held.startMs === startMs &&
      held.endMs === endMs &&
      held.model === request.forecast_model &&
      Date.now() - held.fetchedAtMs < FORECAST_REUSE_MS
        ? held
        : null

    let candidates: DiscoveredDestination[]
    let discoveredTruncation: { totalFound: number | null; truncated: boolean } = {
      totalFound: null,
      truncated: false,
    }
    const customList = request.custom_destinations ?? []
    if (request.polygon) {
      const discoveryRequest: DestinationsRequest = {
        polygon: request.polygon,
        destination_types: request.destination_types,
        // The client path is the only one (#240), so a discovery knob
        // missing here is a knob that does nothing at all.
        include_unnamed_peaks: request.include_unnamed_peaks ?? false,
        min_elevation_ft: request.min_elevation_ft,
        max_elevation_ft: request.max_elevation_ft,
        top_by_elevation: request.top_by_elevation ?? false,
        // The user's own list rides along with whatever discovery found —
        // the union proceeds even when the polygon itself found nothing.
        // The server owns this merge now, because resolving those rows and
        // then merging them are the same trip.
        ...(customList.length ? { custom_destinations: customList } : {}),
      }
      const res = await postDestinations(discoveryRequest, signal)
      if (!res.ok) {
        const { message, refusal: fields } = await readErrorBody(res)
        if (fields) throw new AnalysisRefusalError(message)
        throw new Error(message)
      }
      const discovered = (await res.json()) as DestinationsResponse
      discoveredTruncation = {
        totalFound: discovered.total_found ?? null,
        truncated: discovered.truncated ?? false,
      }
      candidates = discovered.destinations
    } else {
      candidates = await resolveCustomOnly(customList, signal)
    }

    // Announce the retrieval phase with the final count the moment discovery
    // settles, exactly like the streaming endpoint's up-front progress event.
    setProgress({ processed: 0, total: candidates.length, percent: 0 })

    // Publish the fire check's field now, so its NIFC lookup overlaps the
    // weather fetch below — see fireField's declaration.
    setFireField(candidates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })))
    setFireSeq((n) => n + 1)

    const { response: data, universe: fullField } = await runClientAnalysis(
      request,
      candidates,
      startMs,
      endMs,
      {
        signal,
        maxDestinations,
        reuse: reuse && { rows: reuse.rows, times: reuse.times },
        onPace: handlePace,
        // Each batch, ranked and on screen as it lands, instead of a
        // percentage and an empty table until the thirtieth one returns. The
        // counts are a floor: `total_queried` is what has been forecast so
        // far, so the bar's "N of M" grows and is marked "so far" beside it.
        onPartial: (rows, times) =>
          commitArriving(
            {
              results: rows.slice(0, request.limit),
              total_queried: rows.length,
              total_matched: rows.length,
              times,
            },
            request,
            kind,
            rows,
          ),
        onProgress: (processed, total, message) => {
          setPaceEndMs(null)
          setStatusMessage(message)
          setProgress({
            processed,
            total,
            percent: total ? Math.round((processed / total) * 100) : 100,
          })
        },
      },
    )
    heldForecastsRef.current = {
      rows: fullField,
      times: data.times ?? [],
      startMs,
      endMs,
      model: request.forecast_model,
      fetchedAtMs: reuse?.fetchedAtMs ?? Date.now(),
    }

    // Server-side truncation happened at discovery; client-side (custom/union
    // overflow) inside runClientAnalysis. Either way the caption fields win
    // over per-path nulls.
    commit(
      {
        ...data,
        total_found: data.total_found ?? discoveredTruncation.totalFound,
        truncated: data.truncated || discoveredTruncation.truncated,
      },
      request,
      kind,
      fullField,
    )
  }

  // One explicit fetch per Analyze click: every candidate in the polygon is
  // analyzed (refusing loudly above the ceiling, truncating only on explicit
  // election) and the table shows exactly the ranked rows. Repeats may be
  // served from short-lived caches; nothing is refetched behind the user's
  // back.
  async function analyze(
    request: AnalyzeRequest,
    kind: SelectionKind = 'days',
    options: AnalyzeOptions = {},
  ) {
    const { discovery, compareModels = [] } = options
    // The discovery identity this run answers for. Derived off the request
    // unless the caller says otherwise — the weather-only refresh re-fetches
    // a polygon report through the custom path, so its request carries no
    // polygon and deriving from it would record "no ring searched" for a
    // report that plainly has one.
    const disc =
      discovery ??
      discoveryKeys(request.polygon ?? null, request.destination_types, request.include_unnamed_peaks)
    pendingDiscoveryRef.current = disc
    pendingCompareRef.current = compareModels
    lastRequestRef.current = { request, kind, options }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setRefusal(null)
    // The previous response is deliberately kept: rows on screen stay put while
    // the new analysis runs and are replaced only when its result lands (or
    // removed by an explicit reset). Cancel/error leave them standing too.
    setProgress(null)
    setPaceEndMs(null)
    // Seed the correct first-phase label so nothing generic ("Starting…") flashes
    // during the click→first-event gap: a polygon run opens on discovery, a
    // custom/refresh run goes straight to retrieval (upgraded to the counted label
    // once the up-front progress lands).
    setStatusMessage(request.polygon ? SEARCHING_MESSAGE : 'Retrieving Forecasts…')

    try {
      // No server fallback (#240). An OpenMeteoUnreachable used to reroute the
      // whole analysis through POST /api/analyze/stream on the pod's shared
      // quota — a public quota-amplification surface no ordinary visitor ever
      // exercised (27 review seats, zero fallbacks). It now surfaces below
      // like every other provider failure, with its own message.
      await analyzeViaClient(request, kind, controller.signal)
    } catch (e) {
      // The published fire field describes an analysis that will never
      // commit; drop it so the check falls back to the report still on
      // screen rather than describing rows that never arrived.
      setFireField(null)
      // User-initiated cancel — not an error worth surfacing.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setStatusMessage(null)
      } else if (e instanceof AnalysisRefusalError) {
        setRefusal({ message: e.message })
      } else if (e instanceof OpenMeteoModelCoverage) {
        // Compose the message with the model label from the models list
        const modelLabel =
          models.find((m) => m.id === e.modelId)?.label ?? e.modelId
        setError(`${modelLabel} ${COVERAGE_MESSAGE_TAIL}`)
      } else {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      // A cancelled or failed run leaves whatever rows did land, but they are
      // no longer arriving: nothing more is coming for them.
      setArriving(false)
      setStatusMessage(null)
      setProgress(null)
      setPaceEndMs(null)
    }
  }

  return {
    analyze,
    cancel,
    retry,
    reset,
    analyzed,
    analysisSeq,
    fireField,
    fireSeq,
    loading,
    // The rows on screen are a floor while this holds (#337).
    arriving,
    error,
    refusal,
    response,
    universe,
    statusMessage,
    progress,
    paceEndMs,
  }
}
