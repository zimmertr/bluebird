// Composes the full-screen loading overlay for an Analyze operation — a single
// ranked streaming analysis (searched places and CSV rows ride inside it as
// custom destinations). Two destination-type-agnostic phases:
//   1. "Searching for Destinations…"  — Overpass discovery (backend status)
//   2. "Retrieving {N} Forecasts…"    — the weather fetch (a lone forecast
//        reads "Retrieving Forecast…")
//
// The message carries only the TOTAL, not a live "x of y" fraction; the filling
// progress BAR visualizes the real batch progress underneath it.
//
// Under the message, the search phase can show one secondary `detail` line:
// real backend news (mirror failover, via the SSE `detail` field) wins over the
// timer-staged reassurance that appears once a search has run long.
export type OverlayProgress = { processed: number; total: number; percent: number }

export type OverlayView =
  | { visible: false }
  | { visible: true; message: string; detail: string | null; progress: OverlayProgress | null }

export interface OverlayInputs {
  analyzeLoading: boolean // ranked streaming request in flight
  statusMessage: string | null // latest backend status (drives phase 1 + the gap)
  statusDetail: string | null // backend failover detail (SSE `detail` field)
  elapsedS: number // whole seconds since the overlay appeared
  rankedProgress: { processed: number; total: number } | null // batch progress
}

// The discovery-phase heading. Shared with useAnalyze's optimistic seed so the
// staged reassurance below can key on "still actually searching" without a
// second copy of the string drifting.
export const SEARCHING_MESSAGE = 'Searching for Destinations…'

// Reassurance for a long-running search: the common case lands well under this
// (overpass-api.de measured 12-17s, issue #177), so the line only appears for
// the analyses genuinely big or unlucky enough to need explaining.
const STILL_SEARCHING_AFTER_S = 12
const STILL_SEARCHING = 'Still searching. Large areas can take up to 30 seconds.'

// "Retrieving Forecast…" for exactly one, "Retrieving {N} Forecasts…" otherwise.
function retrievingLabel(total: number): string {
  return total === 1 ? 'Retrieving Forecast…' : `Retrieving ${total} Forecasts…`
}

export function composeOverlay(i: OverlayInputs): OverlayView {
  if (!i.analyzeLoading) return { visible: false }
  // No batch progress yet — show the backend's phase status ("Searching for
  // Destinations…", then "Retrieving Forecasts…" in the brief gap before the
  // first weather batch, where the total isn't known yet).
  if (!i.rankedProgress) {
    const message = i.statusMessage ?? 'Retrieving Forecasts…'
    // Staged copy only while genuinely searching — in the retrieval gap it
    // would contradict the heading above it.
    const staged =
      message === SEARCHING_MESSAGE && i.elapsedS >= STILL_SEARCHING_AFTER_S
        ? STILL_SEARCHING
        : null
    return { visible: true, message, detail: i.statusDetail ?? staged, progress: null }
  }
  const { processed, total } = i.rankedProgress
  const percent = total ? Math.round((processed / total) * 100) : 100
  return {
    visible: true,
    message: retrievingLabel(total),
    detail: null,
    progress: { processed, total, percent },
  }
}
