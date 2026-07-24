// Composes the full-screen loading overlay for an Analyze operation — a single
// ranked streaming analysis (searched places and CSV rows ride inside it as
// custom destinations). Two destination-type-agnostic phases:
//   1. "Searching for Destinations…"  — Overpass discovery (backend status)
//   2. "Retrieving {N} Forecasts…"    — the weather fetch (a lone forecast
//        reads "Retrieving Forecast…")
//
// The message carries only the TOTAL, not a live "x of y" fraction; the filling
// progress BAR visualizes the real batch progress underneath it.
export type OverlayProgress = { processed: number; total: number; percent: number }

export type OverlayView =
  | { visible: false }
  | { visible: true; message: string; progress: OverlayProgress | null }

export interface OverlayInputs {
  analyzeLoading: boolean // ranked streaming request in flight
  statusMessage: string | null // latest backend status (drives phase 1 + the gap)
  rankedProgress: { processed: number; total: number } | null // batch progress
}

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
    return { visible: true, message: i.statusMessage ?? 'Retrieving Forecasts…', progress: null }
  }
  const { processed, total } = i.rankedProgress
  const percent = total ? Math.round((processed / total) * 100) : 100
  return { visible: true, message: retrievingLabel(total), progress: { processed, total, percent } }
}
