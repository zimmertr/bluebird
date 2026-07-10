import { useRef, useState } from 'react'
import { AnalyzeRequest, AnalyzeResponse, SortBy } from '../types'

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
}

export function useAnalyze() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  const [analyzed, setAnalyzed] = useState<AnalyzedView | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastRequestRef = useRef<AnalyzeRequest | null>(null)

  // Abort the in-flight request. The fetch loop swallows AbortError so no error
  // banner shows — the user chose to stop.
  function cancel() {
    abortRef.current?.abort()
  }

  // Re-run the most recent request (used by the "Try again" button on errors).
  function retry() {
    if (lastRequestRef.current) analyze(lastRequestRef.current)
  }

  // One explicit fetch per Analyze click: the server ranks its candidate pool
  // (limit × 5, capped at 200) and returns exactly the table rows. Nothing is
  // cached or refetched behind the user's back.
  async function analyze(request: AnalyzeRequest) {
    lastRequestRef.current = request

    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setResponse(null)
    setProgress(null)
    setStatusMessage('Starting…')

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

  return { analyze, cancel, retry, analyzed, loading, error, response, statusMessage, progress }
}
