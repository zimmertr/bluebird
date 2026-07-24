// Composes the full-screen loading overlay for an Analyze operation.
//
// An Analyze runs up to two requests: the ranked streaming analysis (polygon
// discovery or a CSV/refresh weather fetch), and — alongside it — a refresh of
// any pinned searched destinations. The overlay reports them as one operation,
// with three destination-type-agnostic phases:
//   1. "Searching for Destinations…"  — Overpass discovery (backend status)
//   2. "Analyzing Forecasts…"         — post-discovery, or a pins-only refresh
//   3. "Retrieving Forecasts… (x/y)"  — the weather fetch, counting the UNION of
//        the ranked rows and the pins refreshed with them, so a searched pin the
//        user expects to see move is included in the total.
//
// Phases 1–2 come straight from the backend status string; phase 3 is composed
// here because only the client knows the pin count (pins are a separate request).
export const ANALYZING_MESSAGE = 'Analyzing Forecasts…'

export type OverlayProgress = { processed: number; total: number; percent: number }

export type OverlayView =
  | { visible: false }
  | { visible: true; message: string; progress: OverlayProgress | null }

export interface OverlayInputs {
  analyzeLoading: boolean // ranked streaming request in flight
  statusMessage: string | null // latest backend status (drives phases 1–2)
  rankedProgress: { processed: number; total: number } | null // batch progress
  pinsOnly: boolean // an announced pins-only refresh, with no ranked run
  pinsCount: number // pins being refreshed alongside a ranked run
  pinsDone: boolean // their single (non-streaming) fetch has resolved
}

export function composeOverlay(i: OverlayInputs): OverlayView {
  if (!i.analyzeLoading) {
    // No ranked run: only a pins-only refresh can raise the overlay. Its single
    // request has no batch progress, so it shows indeterminate "Analyzing…".
    if (i.pinsOnly) return { visible: true, message: ANALYZING_MESSAGE, progress: null }
    return { visible: false }
  }
  // Ranked run in flight but no batch progress yet — show the backend's phase
  // status verbatim ("Searching for Destinations…" → "Analyzing Forecasts…").
  if (!i.rankedProgress) {
    return { visible: true, message: i.statusMessage ?? ANALYZING_MESSAGE, progress: null }
  }
  // Weather phase: fold the pins into the count. A pin's fetch is one shot, so it
  // contributes 0 until it resolves, then its whole count — never a partial.
  const processed = i.rankedProgress.processed + (i.pinsDone ? i.pinsCount : 0)
  const total = i.rankedProgress.total + i.pinsCount
  const percent = total ? Math.round((processed / total) * 100) : 100
  return {
    visible: true,
    message: `Retrieving Forecasts… (${processed}/${total})`,
    progress: { processed, total, percent },
  }
}
