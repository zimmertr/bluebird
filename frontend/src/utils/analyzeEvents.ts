import { AnalyzeResponse } from '../types'

// One parsed `data:` payload from POST /api/analyze/stream. `type` is the
// discriminator ('status' | 'progress' | 'keepalive' | 'error' | 'result');
// the other fields are populated per event type. `detail` is the optional
// secondary line a status event carries for mid-phase news (a backup map
// server, a weather-quota pace wait). An over-limit error event also carries
// the AnalysisRefusal remedy fields; an upstream rate limit carries `scope`
// and `retry_after_s`.
export type AnalyzeStreamEvent = {
  type: string
  message?: string
  detail?: string
  data?: AnalyzeResponse
  processed?: number
  total?: number
  percent?: number
  found?: number | null
  limit?: number | null
  suggested_min_elevation_ft?: number | null
  suggested_keeps?: number | null
  scope?: string | null
  retry_after_s?: number
}

// Split an accumulating SSE buffer into the complete events it contains plus
// the unfinished remainder to carry into the next chunk. Events are separated
// by blank lines; the JSON payload rides a "data: " line. A malformed payload
// is dropped rather than thrown so one bad frame can't kill the stream.
export function drainSseBuffer(buffer: string): {
  events: AnalyzeStreamEvent[]
  rest: string
} {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: AnalyzeStreamEvent[] = []
  for (const part of parts) {
    const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) continue
    try {
      events.push(JSON.parse(dataLine.slice(6)))
    } catch {
      // Malformed frame: skip it and keep draining.
    }
  }
  return { events, rest }
}
