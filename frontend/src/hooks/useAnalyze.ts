import { useRef, useState } from 'react'
import {
  AnalysisMode,
  AnalyzeRequest,
  AnalyzeResponse,
  DestinationsResponse,
  DiscoveredDestination,
  SortBy,
} from '../types'
import { drainSseBuffer } from '../utils/analyzeEvents'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { customRows, mergeCustom, runClientAnalysis } from '../utils/clientAnalyze'
import { resolveWindow } from '../utils/forecastWindow'
import { OpenMeteoUnreachable } from '../utils/openMeteo'

export type Progress = {
  processed: number
  total: number
  percent: number
}

// The ranking that produced the current response. Everything derived from the
// results (table order, marker colors, legend, header) renders from this
// snapshot, not from the live panel knobs — knob changes never touch the
// displayed analysis until the next explicit Analyze.
export type AnalyzedView = {
  sortBy: SortBy
  sortDesc: boolean
  // 'now'/'at' when the analysis was a point sample — drives the collapsed
  // table columns, point wording, and hidden chart.
  mode: AnalysisMode
  // The sampled moment (epoch ms): the click time for 'now', the chosen hour
  // for 'at' — the "as of HH:MM" / "for <datetime>" caption. Meaningless (the
  // click time) for window analyses, which never display it.
  analyzedAt: number
}

// FastAPI validation errors (422) carry detail as an array of {msg, ...}
// objects rather than a string — flatten to something readable.
async function readErrorDetail(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}))
  const detail = (body as { detail?: unknown }).detail
  const message =
    typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
      ? detail
          .map((d) => (d as { msg?: string }).msg ?? '')
          .filter(Boolean)
          .join('; ')
      : ''
  return message || `HTTP ${res.status}`
}

export function useAnalyze() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  // Secondary line for the search phase (SSE `detail`): mirror-failover news.
  const [statusDetail, setStatusDetail] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<{ request: AnalyzeRequest; mode: AnalysisMode } | null>(null)

  // Abort the in-flight request. The fetch loops swallow AbortError so no
  // error banner shows — the user chose to stop.
  function cancel() {
    abortRef.current?.abort()
  }

  // Re-run the most recent request (used by the "Try again" button on errors).
  function retry() {
    if (lastRequestRef.current) analyze(lastRequestRef.current.request, lastRequestRef.current.mode)
  }

  // Clear the current ranked results without fetching. Used by a pins-only
  // Analyze so a stale ranking (e.g. from a since-deleted polygon) doesn't
  // linger in the table and on the map above the refetched pins.
  function reset() {
    setResponse(null)
    setAnalyzed(null)
    setError(null)
    lastRequestRef.current = null
  }

  function commit(data: AnalyzeResponse, request: AnalyzeRequest, mode: AnalysisMode) {
    setResponse(data)
    setAnalyzed({
      sortBy: request.sort_by ?? 'precip_total_in',
      sortDesc: request.sort_desc ?? false,
      mode,
      // Point modes send the sampled moment as start_datetime (for 'now' it
      // IS the click time), so it doubles as the caption.
      analyzedAt: mode === 'window' ? Date.now() : Date.parse(request.start_datetime),
    })
  }

  // The primary path (#170): the browser does the analysis itself. Discovery
  // is the only server call — POST /api/destinations, one Overpass query —
  // and the forecasts come straight from Open-Meteo on the visitor's own IP
  // and quota. Custom/refresh analyses skip the server entirely. Throws
  // OpenMeteoUnreachable when the forecast API can't be reached, which is
  // the caller's cue to fall back to the server pipeline; every other error
  // is surfaced as-is because the server would refuse identically.
  async function analyzeViaClient(
    request: AnalyzeRequest,
    mode: AnalysisMode,
    signal: AbortSignal,
  ): Promise<void> {
    const { startMs, endMs } = resolveWindow(request.start_datetime, request.end_datetime)

    let candidates: DiscoveredDestination[]
    if (request.polygon) {
      const res = await fetch('/api/destinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          polygon: request.polygon,
          destination_type: request.destination_type,
          min_elevation_ft: request.min_elevation_ft,
          max_elevation_ft: request.max_elevation_ft,
        }),
        signal,
      })
      if (!res.ok) throw new Error(await readErrorDetail(res))
      const discovered = ((await res.json()) as DestinationsResponse).destinations
      // The user's own list rides along with whatever discovery found — the
      // union proceeds even when the polygon itself found nothing.
      candidates = request.custom_destinations?.length
        ? mergeCustom(discovered, customRows(request.custom_destinations))
        : discovered
    } else {
      candidates = customRows(request.custom_destinations ?? [])
    }

    // Announce the retrieval phase with the final count the moment discovery
    // settles, exactly like the streaming endpoint's up-front progress event.
    setProgress({ processed: 0, total: candidates.length, percent: 0 })

    const data = await runClientAnalysis(request, candidates, startMs, endMs, {
      signal,
      onProgress: (processed, total, message) => {
        setStatusMessage(message)
        setProgress({
          processed,
          total,
          percent: total ? Math.round((processed / total) * 100) : 100,
        })
      },
    })
    commit(data, request, mode)
  }

  // The server pipeline, unchanged: POST /api/analyze/stream and render its
  // SSE events. Still the canonical API and the fallback when the browser
  // cannot reach Open-Meteo directly (corporate proxies, outages).
  async function analyzeViaServer(
    request: AnalyzeRequest,
    mode: AnalysisMode,
    signal: AbortSignal,
  ): Promise<void> {
    const res = await fetch('/api/analyze/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })

    if (!res.ok || !res.body) {
      throw new Error(await readErrorDetail(res))
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
          throw new Error(event.message)
        } else if (event.type === 'result' && event.data) {
          commit(event.data, request, mode)
        }
      }
    }
  }

  // One explicit fetch per Analyze click: every candidate in the polygon is
  // analyzed (refusing loudly above the ceiling) and the table shows exactly
  // the ranked rows. Nothing is cached or refetched behind the user's back.
  async function analyze(request: AnalyzeRequest, mode: AnalysisMode = 'window') {
    lastRequestRef.current = { request, mode }

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    // The previous response is deliberately kept: rows on screen stay put while
    // the new analysis runs and are replaced only when its result lands (or
    // removed by an explicit reset). Cancel/error leave them standing too.
    setProgress(null)
    // Seed the correct first-phase label so nothing generic ("Starting…") flashes
    // during the click→first-event gap: a polygon run opens on discovery, a
    // custom/refresh run goes straight to retrieval (upgraded to the counted label
    // once the up-front progress lands).
    setStatusMessage(request.polygon ? SEARCHING_MESSAGE : 'Retrieving Forecasts…')
    setStatusDetail(null)

    try {
      try {
        await analyzeViaClient(request, mode, controller.signal)
        return
      } catch (e) {
        // Only an unreachable forecast API reroutes to the server (which
        // fetches Open-Meteo from its own network). Everything else —
        // validation, discovery refusals, rate limits, a user cancel — means
        // the server would refuse identically, so surface it instead.
        if (!(e instanceof OpenMeteoUnreachable)) throw e
        console.warn('Open-Meteo unreachable from this browser; falling back to the server analysis:', e.message)
        setStatusMessage('Retrieving Forecasts…')
        setStatusDetail(null)
        setProgress(null)
      }
      await analyzeViaServer(request, mode, controller.signal)
    } catch (e) {
      // User-initiated cancel — not an error worth surfacing.
      if (e instanceof DOMException && e.name === 'AbortError') {
        setStatusMessage(null)
      } else {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      abortRef.current = null
      setLoading(false)
      setStatusMessage(null)
      setStatusDetail(null)
      setProgress(null)
    }
  }

  return {
    analyze,
    cancel,
    retry,
    reset,
    analyzed,
    loading,
    error,
    response,
    statusMessage,
    statusDetail,
    progress,
  }
}
