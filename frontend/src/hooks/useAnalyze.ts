import { useRef, useState } from 'react'
import { AnalyzeRequest, AnalyzeResponse, DestinationResult, SortBy } from '../types'

type CacheEntry = {
  key: string
  allResults: DestinationResult[]
  totalQueried: number
}

export type Progress = {
  processed: number
  total: number
  percent: number
}

function sortAndLimit(
  results: DestinationResult[],
  sortBy: SortBy,
  limit: number,
  minElev: number | null | undefined,
  maxElev: number | null | undefined,
): DestinationResult[] {
  return [...results]
    .filter((r) => {
      const elev = r.elevation_ft
      if (elev == null) return true // can't filter unknown elevation
      if (minElev != null && elev < minElev) return false
      if (maxElev != null && elev > maxElev) return false
      return true
    })
    .sort((a, b) => {
      // Nullable metrics (AQI beyond its horizon) rank last, never as 0/best
      const av = a[sortBy]
      const bv = b[sortBy]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av as number) - (bv as number)
    })
    .slice(0, limit)
}

function makeCacheKey(req: AnalyzeRequest): string {
  return JSON.stringify({
    polygon: req.polygon,
    destination_type: req.destination_type,
    start_datetime: req.start_datetime,
    end_datetime: req.end_datetime,
    custom_destinations: req.custom_destinations,
  })
}

export function useAnalyze() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [response, setResponse] = useState<AnalyzeResponse | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const cacheRef = useRef<CacheEntry | null>(null)
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

  async function analyze(request: AnalyzeRequest) {
    lastRequestRef.current = request
    const key = makeCacheKey(request)
    const sortBy: SortBy = request.sort_by ?? 'precip_total_in'
    const limit = request.limit ?? 10

    const minElev = request.min_elevation_ft
    const maxElev = request.max_elevation_ft

    // Cache hit — re-sort/re-filter locally, no API call
    if (cacheRef.current?.key === key) {
      const displayed = sortAndLimit(cacheRef.current.allResults, sortBy, limit, minElev, maxElev)
      setResponse({ results: displayed, total_queried: cacheRef.current.totalQueried })
      return
    }

    // Cache miss — full SSE request; always fetch 200 to populate the cache
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    setResponse(null)
    setProgress(null)
    setStatusMessage('Starting…')

    try {
      // Strip client-only fields before sending to backend
      const { min_elevation_ft: _a, max_elevation_ft: _b, ...serverRequest } = request
      const res = await fetch('/api/analyze/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...serverRequest, limit: 200, sort_by: 'precip_total_in' }),
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
            const allResults = event.data.results
            const totalQueried = event.data.total_queried
            cacheRef.current = { key, allResults, totalQueried }
            const displayed = sortAndLimit(allResults, sortBy, limit, minElev, maxElev)
            setResponse({ results: displayed, total_queried: totalQueried })
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

  return { analyze, cancel, retry, loading, error, response, statusMessage, progress }
}
