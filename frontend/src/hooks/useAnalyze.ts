import { useRef, useState } from 'react'
import { AnalysisMode, AnalyzeRequest, AnalyzeResponse, SortBy } from '../types'

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

export function useAnalyze() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<{ request: AnalyzeRequest; mode: AnalysisMode } | null>(null)

  // Abort the in-flight request. The fetch loop swallows AbortError so no error
  // banner shows — the user chose to stop.
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

  // One explicit fetch per Analyze click: the server analyzes every candidate
  // in the polygon (refusing loudly above its ceiling) and returns exactly the
  // table rows. Nothing is cached or refetched behind the user's back.
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
    // during the click→first-SSE-event gap: a polygon run opens on discovery, a
    // custom/refresh run goes straight to retrieval (upgraded to the counted label
    // once the up-front progress event lands).
    setStatusMessage(request.polygon ? 'Searching for Destinations…' : 'Retrieving Forecasts…')

    try {
      const res = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}))
        // FastAPI validation errors (422) carry detail as an array of
        // {msg, ...} objects rather than a string — flatten to something readable.
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
        throw new Error(message || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
          if (!dataLine) continue
          let event: {
            type: string
            message?: string
            data?: AnalyzeResponse
            processed?: number
            total?: number
            percent?: number
          }
          try {
            event = JSON.parse(dataLine.slice(6))
          } catch {
            continue
          }

          if (event.type === 'status' && event.message) {
            setStatusMessage(event.message)
          } else if (event.type === 'progress') {
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
            setResponse(event.data)
            setAnalyzed({
              sortBy: request.sort_by ?? 'precip_total_in',
              sortDesc: request.sort_desc ?? false,
              mode,
              // Point modes send the sampled moment as start_datetime (for
              // 'now' it IS the click time), so it doubles as the caption.
              analyzedAt:
                mode === 'window' ? Date.now() : Date.parse(request.start_datetime),
            })
          }
        }
      }
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
      setProgress(null)
    }
  }

  return { analyze, cancel, retry, reset, analyzed, loading, error, response, statusMessage, progress }
}
