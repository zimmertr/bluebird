// Composes the full-screen loading overlay for an Analyze operation.
//
// An Analyze runs up to two requests: the ranked streaming analysis (polygon
// discovery, or a CSV/refresh weather fetch), and — alongside it — a refresh of
// any pinned searched destinations. The overlay reports them as one operation
// in two destination-type-agnostic phases:
//   1. "Searching for Destinations…"      — Overpass discovery (backend status)
//   2. "Retrieving Forecast[s]… [(x/y)]"  — the weather fetch, counting the UNION
//        of the ranked rows and the pins refreshed with them, so a searched pin
//        the user expects to see move is included. The count appears only when
//        more than one forecast is in flight AND there's live progress to report;
//        a lone forecast reads simply "Retrieving Forecast…".
//
// The searching status comes straight from the backend; the retrieving line is
// composed here because only the client knows the pin count (pins are a separate
// request) and whether live batch progress exists.
export type OverlayProgress = { processed: number; total: number; percent: number }

export type OverlayView =
  | { visible: false }
  | { visible: true; message: string; progress: OverlayProgress | null }

export interface OverlayInputs {
  analyzeLoading: boolean // ranked streaming request in flight
  statusMessage: string | null // latest backend status (drives phase 1 + the gap)
  rankedProgress: { processed: number; total: number } | null // batch progress
  pinsOnly: boolean // an announced pins-only refresh, with no ranked run
  pinsCount: number // pins being refreshed alongside a ranked run
  pinsDone: boolean // their single (non-streaming) fetch has resolved
}

// "Retrieving Forecast…" for exactly one, "Retrieving Forecasts…" otherwise.
// The (x/y) count is appended separately, only where live progress exists.
function retrievingLabel(count: number): string {
  return count === 1 ? 'Retrieving Forecast…' : 'Retrieving Forecasts…'
}

export function composeOverlay(i: OverlayInputs): OverlayView {
  if (!i.analyzeLoading) {
    // No ranked run: only a pins-only refresh raises the overlay. Its single
    // request has no batch progress, so there's no live (x/y) — just the
    // singular/plural label over an indeterminate bar.
    if (i.pinsOnly) return { visible: true, message: retrievingLabel(i.pinsCount), progress: null }
    return { visible: false }
  }
  // Ranked run in flight but no batch progress yet — show the backend's phase
  // status verbatim ("Searching for Destinations…", then "Retrieving Forecasts…"
  // in the brief gap before the first weather batch reports).
  if (!i.rankedProgress) {
    return { visible: true, message: i.statusMessage ?? retrievingLabel(0), progress: null }
  }
  // Weather phase: fold the pins into the count. A pin's fetch is one shot, so it
  // contributes 0 until it resolves, then its whole count — never a partial.
  const processed = i.rankedProgress.processed + (i.pinsDone ? i.pinsCount : 0)
  const total = i.rankedProgress.total + i.pinsCount
  const percent = total ? Math.round((processed / total) * 100) : 100
  const message = total === 1 ? 'Retrieving Forecast…' : `Retrieving Forecasts… (${processed}/${total})`
  return { visible: true, message, progress: { processed, total, percent } }
}
