import { useRef, useState } from 'react'
import {
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationResult,
  DestinationsResponse,
  DiscoveredDestination,
  RefusalFields,
} from '../types'
import { drainSseBuffer } from '../utils/analyzeEvents'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { resolveWindow } from '../utils/forecastWindow'
import {
  AnalysisRefusalError,
  MAX_ANALYZE_DESTINATIONS,
  constraintsFromRequest,
  resolveCustomOnly,
  runClientAnalysis,
} from '../utils/clientAnalyze'
import { pinKey } from '../utils/customList'
import { OpenMeteoUnreachable } from '../utils/openMeteo'
import { SelectionKind } from '../utils/calendar'
import { PresentationKnobs } from '../utils/present'

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
// server's structured 400, the stream's error event, or the client-only
// paths' AnalysisRefusalError). Drives the remedy panel instead of the plain
// error box: a deterministic refusal retried verbatim can only repeat itself.
export type Refusal = {
  message: string
  found: number | null
  limit: number | null
  suggestedMinElevationFt: number | null
  suggestedKeeps: number | null
}

// The data snapshot behind the current response: the window it sampled, and
// the presentation knobs it was requested with.
//
// The knobs are recorded so the live ones can be compared against them, which
// is how `utils/present.ts` decides whether the display can be re-derived from
// the held field or genuinely needs another Analyze (#188). On the client path
// sort and limit are re-derived, so this copy of them is history rather than
// the display source; on the server SSE path, where there is no field to
// re-derive from, it stays the display source as it always was.
// Composes PresentationKnobs rather than restating them, so the recorded set
// and the compared set cannot drift apart.
export type AnalyzedView = PresentationKnobs & {
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
  // The custom destinations this analysis covered — searched places and pasted
  // CSV rows, by pinKey. Recorded off the request rather than read back off the
  // results, which are cut to `limit` and so cannot answer "was this analyzed?"
  // for a field bigger than the cut (#205). Taken from the request also makes
  // the answer path-independent: the SSE fallback sends no universe, but the
  // browser still knows what it submitted.
  customKeys: ReadonlySet<string>
  // The model that produced every number in the field. A data knob like the
  // window, and recorded for the same reason: the panel's model can move
  // afterwards, and when it does the held rows are not stale so much as
  // answers to a different question.
  forecastModel: string
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

function refusalFromFields(message: string, fields: RefusalFields): Refusal {
  return {
    message,
    found: fields.found ?? null,
    limit: fields.limit ?? null,
    suggestedMinElevationFt: fields.suggested_min_elevation_ft ?? null,
    suggestedKeeps: fields.suggested_keeps ?? null,
  }
}

export function useAnalyze(maxDestinations: number = MAX_ANALYZE_DESTINATIONS) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  // The full ranked field behind `response`, before the `limit` cut, when the
  // browser did the analysis itself. Null on the server SSE path, which only
  // sends the trimmed rows — callers must treat "no universe" as a real state
  // and degrade, not assume the displayed rows are the whole field.
  const [universe, setUniverse] = useState<DestinationResult[] | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  // Bumped once per committed analysis. See commit().
  const [analysisSeq, setAnalysisSeq] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  // Secondary line for the search phase (SSE `detail`): mirror-failover news,
  // a pace wait, or the announced server fallback.
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  // When the client pacer is sleeping off a quota deficit, the wall-clock
  // moment it resumes — the overlay renders a live countdown from this.
  const [paceEndMs, setPaceEndMs] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<{ request: AnalyzeRequest; kind: SelectionKind } | null>(null)
  // The forecasts the last browser analysis fetched, kept so the next one only
  // pays for what it does not already have. Widening the elevation band is the
  // case this exists for: it readmits destinations this report never fetched
  // without invalidating the ones in hand, and before this it re-bought every
  // forecast on screen to add a few. It helps any re-analysis at the same
  // window and model — a pasted destination, a toggled unnamed-peaks — since
  // reuse is decided per destination rather than per reason.
  //
  // Null on the server path by construction: that path is handed trimmed rows
  // and no field, so there is nothing to reuse and nothing to reuse it for.
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
  // transient errors; deterministic refusals get remedy actions instead).
  function retry() {
    if (lastRequestRef.current) analyze(lastRequestRef.current.request, lastRequestRef.current.kind)
  }

  // Remedy: re-run the last request with the suggested elevation floor.
  function retryWithFloor(minElevationFt: number) {
    const last = lastRequestRef.current
    if (!last) return
    analyze(
      { ...last.request, min_elevation_ft: minElevationFt, top_by_elevation: false },
      last.kind,
    )
  }

  // Remedy: re-run the last request electing the top-N-by-elevation cut.
  // Discovery for the identical polygon is served from the server's cache,
  // so the re-run costs no second Overpass query.
  function retryTopByElevation() {
    const last = lastRequestRef.current
    if (!last) return
    analyze({ ...last.request, top_by_elevation: true }, last.kind)
  }

  // Clear the current ranked results without fetching. Used by a pins-only
  // Analyze so a stale ranking (e.g. from a since-deleted polygon) doesn't
  // linger in the table and on the map above the refetched pins.
  function reset() {
    setResponse(null)
    setUniverse(null)
    setAnalyzed(null)
    setError(null)
    setRefusal(null)
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
    fullField: DestinationResult[] | null,
  ) {
    setResponse(data)
    setUniverse(fullField)
    setAnalyzed({
      sortBy: request.sort_by ?? 'precip_total_in',
      sortDesc: request.sort_desc ?? false,
      limit: request.limit,
      band: {
        min: request.min_elevation_ft ?? null,
        max: request.max_elevation_ft ?? null,
      },
      constraints: constraintsFromRequest(request),
      kind,
      window: {
        startMs: Date.parse(request.start_datetime),
        endMs: Date.parse(request.end_datetime),
      },
      customKeys: new Set(
        (request.custom_destinations ?? []).map((d) => pinKey(d.latitude, d.longitude)),
      ),
      forecastModel: request.forecast_model,
    })
    // A fresh report, which is not the same event as a fresh row array: live
    // knobs rebuild the rows constantly. Surfaces that reset per report (the
    // table's detail-column sort) key off this rather than off the rows.
    setAnalysisSeq((n) => n + 1)
  }

  function handlePace(seconds: number) {
    setPaceEndMs(Date.now() + seconds * 1000)
  }

  // The primary path (#170): the browser does the analysis itself. The
  // candidate list is the only server call — POST /api/destinations, one
  // Overpass query — and the forecasts come straight from Open-Meteo on the
  // visitor's own IP and quota, paced under it. Throws OpenMeteoUnreachable
  // when the forecast API can't be reached (network/CORS), which is the
  // caller's cue to fall back to the server pipeline. A rate limit is NOT
  // that cue: the quota is per IP, and for a deployment sharing its egress
  // with the visitor a same-IP retry only deepens the exhaustion (issue
  // #180) — those surface honestly instead.
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
      const res = await fetch('/api/destinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon: request.polygon,
          destination_types: request.destination_types,
          // The client path is the normal one — the SSE route below is only
          // reached when Open-Meteo is unreachable from the browser — so a
          // discovery knob missing here is a knob that does nothing at all.
          include_unnamed_peaks: request.include_unnamed_peaks ?? false,
          min_elevation_ft: request.min_elevation_ft,
          max_elevation_ft: request.max_elevation_ft,
          top_by_elevation: request.top_by_elevation ?? false,
          // The user's own list rides along with whatever discovery found —
          // the union proceeds even when the polygon itself found nothing.
          // The server owns this merge now, because resolving those rows and
          // then merging them are the same trip.
          ...(customList.length ? { custom_destinations: customList } : {}),
        }),
        signal,
      })
      if (!res.ok) {
        const { message, refusal: fields } = await readErrorBody(res)
        if (fields) {
          throw new AnalysisRefusalError(
            message,
            fields.found ?? 0,
            fields.limit ?? maxDestinations,
            fields.suggested_min_elevation_ft != null
              ? {
                  floorFt: fields.suggested_min_elevation_ft,
                  keeps: fields.suggested_keeps ?? 0,
                }
              : null,
          )
        }
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

  // The server pipeline, unchanged in role: POST /api/analyze/stream and
  // render its SSE events. Still the canonical API and the fallback when the
  // browser cannot reach Open-Meteo directly (corporate proxies, outages).
  async function analyzeViaServer(
    request: AnalyzeRequest,
    kind: SelectionKind,
    signal: AbortSignal,
  ): Promise<void> {
    // This path commits no field, so anything held is about to describe a
    // report the browser can no longer re-derive. Dropped rather than kept, or
    // a later client analysis would reuse forecasts from a report whose own
    // rows were never held.
    heldForecastsRef.current = null
    const res = await fetch('/api/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })

    if (!res.ok || !res.body) {
      const { message } = await readErrorBody(res)
      throw new Error(message)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const drained = drainSseBuffer(buffer)
      buffer = drained.rest

      for (const event of drained.events) {
        if (event.type === 'status' && event.message) {
          setStatusMessage(event.message)
          // Absent detail on a status event clears any stale failover line.
          setStatusDetail(event.detail ?? null)
        } else if (event.type === 'progress') {
          setStatusDetail(null)
          if (event.message) setStatusMessage(event.message)
          if (event.total != null && event.processed != null) {
            setProgress({
              processed: event.processed,
              total: event.total,
              percent: event.percent ?? Math.round((event.processed / event.total) * 100),
            })
          }
        } else if (event.type === 'error' && event.message) {
          if (event.found != null) {
            throw new AnalysisRefusalError(
              event.message,
              event.found,
              event.limit ?? maxDestinations,
              event.suggested_min_elevation_ft != null
                ? {
                    floorFt: event.suggested_min_elevation_ft,
                    keeps: event.suggested_keeps ?? 0,
                  }
                : null,
            )
          }
          throw new Error(event.message)
        } else if (event.type === 'result' && event.data) {
          // No universe: the stream sends the ranked rows already cut to
          // `limit` (routes/analyze.py trims before the result event), so this
          // path cannot offer an exact re-rank later. Deliberate: growing the
          // response shape to serve a fallback the browser takes only when
          // Open-Meteo is unreachable is not worth the contract change (#177).
          commit(event.data, request, kind, null)
        }
        // Unknown types (keepalive) are ignored by construction.
      }
    }
  }

  // One explicit fetch per Analyze click: every candidate in the polygon is
  // analyzed (refusing loudly above the ceiling, truncating only on explicit
  // election) and the table shows exactly the ranked rows. Repeats may be
  // served from short-lived caches; nothing is refetched behind the user's
  // back.
  async function analyze(request: AnalyzeRequest, kind: SelectionKind = 'days') {
    lastRequestRef.current = { request, kind }

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
    setStatusDetail(null)

    try {
      try {
        await analyzeViaClient(request, kind, controller.signal)
        return
      } catch (e) {
        // ONLY an unreachable forecast API reroutes to the server, whose
        // different network path can genuinely help. Everything else —
        // validation, refusals, rate limits (same IP pool), HTTP errors
        // (same upstream), a user cancel — surfaces directly. And the
        // reroute announces itself: the silent phase regression was the
        // "restart loop" of issue #180.
        if (!(e instanceof OpenMeteoUnreachable)) throw e
        console.warn(
          'Open-Meteo unreachable from this browser; falling back to the server analysis:',
          e.message,
        )
        setStatusMessage('Retrieving Forecasts…')
        setStatusDetail('Weather service unreachable from this browser. Retrying through the server.')
        setProgress(null)
        setPaceEndMs(null)
      }
      await analyzeViaServer(request, kind, controller.signal)
    } catch (e) {
      // User-initiated cancel — not an error worth surfacing.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setStatusMessage(null)
      } else if (e instanceof AnalysisRefusalError) {
        setRefusal(
          refusalFromFields(e.message, {
            found: e.found,
            limit: e.limit,
            suggested_min_elevation_ft: e.suggestedMinElevationFt,
            suggested_keeps: e.suggestedKeeps,
          }),
        )
      } else {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStatusMessage(null)
      setStatusDetail(null)
      setProgress(null)
      setPaceEndMs(null)
    }
  }

  return {
    analyze,
    cancel,
    retry,
    retryWithFloor,
    retryTopByElevation,
    reset,
    analyzed,
    analysisSeq,
    loading,
    error,
    refusal,
    response,
    universe,
    statusMessage,
    statusDetail,
    progress,
    paceEndMs,
  }
}
