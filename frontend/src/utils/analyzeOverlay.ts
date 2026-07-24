// Which activity, if any, the full-screen loading overlay should report.
//
// Two independent things can be in flight when Analyze is clicked:
//   - the streaming ranked analysis (`useAnalyze`), which reports rich phase
//     messages ("Found 2 peaks — fetching weather forecasts…") and batch
//     progress; and
//   - a pins-only refresh (`usePinnedForecasts`), a single silent POST with no
//     incremental status.
//
// A ranked analysis, when present, owns the overlay — its messages are more
// informative and it already covers the pin refetch running alongside it. The
// pins-only refresh only surfaces when it's the ONLY work happening (no polygon
// or CSV), which is exactly the case that previously gave the user no feedback.
export const PIN_REFRESH_MESSAGE = 'Refreshing pinned forecasts…'

export type OverlayView =
  | { visible: false }
  | { visible: true; source: 'analyze' | 'pins'; message: string }

export function analyzeOverlay(
  analyzeLoading: boolean,
  statusMessage: string | null,
  pinLoading: boolean,
): OverlayView {
  if (analyzeLoading) {
    return { visible: true, source: 'analyze', message: statusMessage ?? 'Starting…' }
  }
  if (pinLoading) {
    return { visible: true, source: 'pins', message: PIN_REFRESH_MESSAGE }
  }
  return { visible: false }
}
