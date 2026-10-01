import { paceWaitLine } from './pacing'

// Composes the full-screen loading overlay for an Analyze operation — a single
// ranked analysis (searched places and CSV rows ride inside it as custom
// destinations). Two destination-type-agnostic phases:
//   1. "Searching for destinations…"  — Overpass discovery (backend status), or
//      "Retrieving elevation…" for a run with no polygon, whose one wait before
//      the forecasts is the pod's elevation lookup of its listed destinations
//   2. "Retrieving {N} forecasts…"    — the weather fetch (a lone forecast
//        reads "Retrieving forecast…")
//   3. "Retrieving air quality…", then "Retrieving cloud data…" — only when
//      either fetch is still out after the weather has answered (`tailMessage`)
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
export const SEARCHING_MESSAGE = 'Searching for destinations…'

// The first phase of a run with no polygon (#579, the maintainer's words,
// 2026-10-01). Such a run discovers nothing: it waits on POST
// /api/destinations to look up the elevation of every pasted, searched or
// clicked destination, which can take seconds, and it used to say it was
// retrieving forecasts the whole time. A polygon run makes the same lookup
// inside its discovery request, where the browser cannot tell the two apart,
// so it keeps the searching label.
export const ELEVATION_MESSAGE = 'Retrieving elevation…'

// The retrieval heading before the first batch reports its total.
export const RETRIEVING_MESSAGE = 'Retrieving forecasts…'

// The tail (#579, the maintainer, 2026-10-01). Air quality and the cloud
// column are fetched beside the weather but awaited after it, so either can
// keep the run waiting with the bar already full. Each label names the fetch
// still out, air quality first, because that is the order the run awaits them.
export const AQI_TAIL_MESSAGE = 'Retrieving air quality…'
export const CLOUD_TAIL_MESSAGE = 'Retrieving cloud data…'

// Which tail label stands, given what is still out once the weather has
// answered: air quality while it is open, then the cloud column, then none.
export function tailMessage(open: { aqi: boolean; cloud: boolean }): string | null {
  if (open.aqi) return AQI_TAIL_MESSAGE
  if (open.cloud) return CLOUD_TAIL_MESSAGE
  return null
}

const TAIL_MESSAGES: readonly string[] = [AQI_TAIL_MESSAGE, CLOUD_TAIL_MESSAGE]

// Staged reassurance, tiered to the measured mirror behavior (issue #180):
// overpass-api.de answers big polygons in 12-42s; a failover adds the backup
// mirror's 38-45s on top, so "up to 30 seconds" (the old copy) measured false
// the first time a search crossed it. Tier one covers the common case and we
// show the same message for both tiers now.
const STILL_SEARCHING_AFTER_S = 20
const STILL_SEARCHING = 'Still searching. Large analyses can take a while.'

// "Retrieving forecast…" for exactly one, "Retrieving {N} forecasts…" otherwise.
function retrievingLabel(total: number): string {
  return total === 1 ? 'Retrieving forecast…' : `Retrieving ${total} forecasts…`
}

export function composeOverlay(i: OverlayInputs): OverlayView {
  if (!i.analyzeLoading) return { visible: false }
  // No batch progress yet — show the phase status ("Searching for
  // destinations…" or "Retrieving elevation…", then "Retrieving forecasts…"
  // in the brief gap before the first weather batch, where the total isn't
  // known yet).
  if (!i.rankedProgress) {
    const message = i.statusMessage ?? RETRIEVING_MESSAGE
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
  const detail = paceWaitLine(i.paceRemainingS ?? null)
  // A tail label replaces the forecast count once the weather has answered;
  // the bar stays full under it.
  const tail = i.statusMessage !== null && TAIL_MESSAGES.includes(i.statusMessage) ? i.statusMessage : null
  return {
    visible: true,
    message: tail ?? retrievingLabel(total),
    detail,
    progress: { processed, total, percent },
  }
}
