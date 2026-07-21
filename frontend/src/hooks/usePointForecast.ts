import { useRef, useState } from 'react'
import { AnalyzeRequest, AnalyzeResponse, DestinationResult } from '../types'
import { Place } from '../utils/geocode'

// Full forecast for a single searched point, shown as the pinned row above the
// results table. Rides the existing custom-destinations path of /api/analyze
// (the plain endpoint — no need for SSE progress on one point). Best-effort in
// the same spirit as AQI and NIFC: a failure clears the row, never the UI.
export function usePointForecast() {
  const [row, setRow] = useState<DestinationResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function fetchForPlace(place: Place, startIso: string, endIso: string) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    // Drop any previous point's numbers while this one loads — a stale row
    // must never sit under a freshly moved pin.
    setRow(null)

    const request: AnalyzeRequest = {
      destination_type: 'custom',
      custom_destinations: [
        { name: place.label, latitude: place.lat, longitude: place.lon },
      ],
      start_datetime: startIso,
      end_datetime: endIso,
      limit: 1,
    }

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AnalyzeResponse = await res.json()
      setRow(data.results[0] ?? null)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.warn('Point forecast fetch failed:', e)
      setRow(null)
    }
  }

  function clear() {
    abortRef.current?.abort()
    setRow(null)
  }

  return { row, fetchForPlace, clear }
}
