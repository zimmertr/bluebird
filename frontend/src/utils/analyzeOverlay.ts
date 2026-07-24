// Composes the full-screen loading overlay for an Analyze operation.
//
// An Analyze runs up to two requests: the ranked streaming analysis (polygon
// discovery, or a CSV/refresh weather fetch), and — alongside it — a refresh of
// any pinned searched destinations. The overlay reports them as one operation
// in two destination-type-agnostic phases:
//   1. "Searching for Destinations…"     — Overpass discovery (backend status)
//   2. "Retrieving {N} Forecasts…"       — the weather fetch, over the UNION of
//        the ranked rows and the pins refreshed with them (a lone forecast reads
//        "Retrieving Forecast…").
//
// The message carries only the TOTAL, not a live "x of y" fraction: the total is
// knowable upfront for both paths, but incremental progress isn't — a pins-only
// refresh is a single non-streaming request. The filling progress BAR still
// visualizes real batch progress when it exists (the ranked path); pins get an
// indeterminate bar. So the wording is one shared pattern, and the bar is an
// honest visual that appears only where progress is genuinely countable.
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

// "Retrieving Forecast…" for exactly one, "Retrieving {N} Forecasts…" otherwise.
function retrievingLabel(total: number): string {
  return total === 1 ? 'Retrieving Forecast…' : `Retrieving ${total} Forecasts…`
}

export function composeOverlay(i: OverlayInputs): OverlayView {
  if (!i.analyzeLoading) {
    // No ranked run: only a pins-only refresh raises the overlay. Its single
    // request has no batch progress, so the bar is indeterminate — but the
    // total is known upfront, so the label still names it.
    if (i.pinsOnly) return { visible: true, message: retrievingLabel(i.pinsCount), progress: null }
    return { visible: false }
  }
  // Ranked run in flight but no batch progress yet — show the backend's phase
  // status ("Searching for Destinations…", then "Retrieving Forecasts…" in the
  // brief gap before the first weather batch, where the total isn't known yet).
  if (!i.rankedProgress) {
    return { visible: true, message: i.statusMessage ?? 'Retrieving Forecasts…', progress: null }
  }
  // Weather phase: the total spans the union of the ranked rows and the pins
  // refreshed with them. The bar's `processed` counts pins once their single
  // fetch resolves (never a partial); the label shows only the total.
  const processed = i.rankedProgress.processed + (i.pinsDone ? i.pinsCount : 0)
  const total = i.rankedProgress.total + i.pinsCount
  const percent = total ? Math.round((processed / total) * 100) : 100
  return { visible: true, message: retrievingLabel(total), progress: { processed, total, percent } }
}
