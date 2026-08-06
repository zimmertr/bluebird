// Composes the full-screen loading overlay for an Analyze operation — a single
// ranked analysis (searched places and CSV rows ride inside it as custom
// destinations). Two destination-type-agnostic phases:
//   1. "Searching for Destinations…"  — Overpass discovery (backend status)
//   2. "Retrieving {N} Forecasts…"    — the weather fetch (a lone forecast
//        reads "Retrieving Forecast…")
//
// The message carries only the TOTAL, not a live "x of y" fraction; the filling
// progress BAR visualizes the real batch progress underneath it.
//
// Under the message, one secondary `detail` line can appear: during
// retrieval, the live quota countdown while the pacer sleeps; during a long
// search, a timer-staged reassurance.
export type OverlayProgress = { processed: number; total: number; percent: number }

export type OverlayView =
  | { visible: false }
  | { visible: true; message: string; detail: string | null; progress: OverlayProgress | null }

export interface OverlayInputs {
  analyzeLoading: boolean // ranked analysis in flight
  statusMessage: string | null // latest phase status (drives phase 1 + the gap)
  elapsedS: number // whole seconds since the overlay appeared
  rankedProgress: { processed: number; total: number } | null // batch progress
  // Seconds until the client-side pacer resumes spending quota; null/absent
  // when it is not sleeping. Rendered as a live countdown so a paced wait
  // reads as scheduled work, not a hang.
  paceRemainingS?: number | null
}

// The discovery-phase heading. Shared with useAnalyze's optimistic seed so the
// staged reassurance below can key on "still actually searching" without a
// second copy of the string drifting.
export const SEARCHING_MESSAGE = 'Searching for Destinations…'

// Staged reassurance, tiered to the measured mirror behavior (issue #180):
// overpass-api.de answers big polygons in 12-42s; a failover adds the backup
// mirror's 38-45s on top, so "up to 30 seconds" (the old copy) measured false
// the first time a search crossed it. Tier one covers the common case and we
// show the same message for both tiers now.
const STILL_SEARCHING_AFTER_S = 20
const STILL_SEARCHING = 'Still searching. Large analyses can take a while.'

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
    return { visible: true, message, detail: staged, progress: null }
  }
  const { processed, total } = i.rankedProgress
  const percent = total ? Math.round((processed / total) * 100) : 100
  // During retrieval the detail line carries the live pace countdown when the
  // quota bucket is refilling. A paced analysis must never look hung: the
  // countdown plus the elapsed timer is what proves the wait is scheduled.
  const detail =
    i.paceRemainingS != null && i.paceRemainingS > 0
      ? `Open-Meteo quota: resuming in ${i.paceRemainingS}s`
      : null
  return {
    visible: true,
    message: retrievingLabel(total),
    detail,
    progress: { processed, total, percent },
  }
}
