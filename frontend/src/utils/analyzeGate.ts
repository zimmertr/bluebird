// Whether the Analyze button should be enabled.
//
// There are two ways to give Analyze something to do:
//   - A *ranked report* — either a drawn polygon (peak/trailhead/lake) or a
//     parsed custom-CSV list. This is the app's core query.
//   - A *pinned search* — one or more places searched and pinned to the table.
//     A pin alone enables Analyze too, which then just refetches the pinned
//     forecasts onto the currently-set window (they were first fetched on the
//     default search window and can drift once the user edits the dates).
//
// Either input enables the button, but the shared guards veto both: a forecast
// window must be set and servable, and any drawn polygon must be within the
// area cap. Keeping this as a pure function (rather than inline JSX) is what
// lets it be unit-tested — the frontend suite runs in a bare node environment
// with no component rendering.
export interface AnalyzeGate {
  hasDates: boolean
  hasWindowWarning: boolean
  loading: boolean
  areaTooLarge: boolean
  needsPolygon: boolean
  polygonReady: boolean
  hasCustom: boolean
  hasPins: boolean
}

export function canAnalyze(g: AnalyzeGate): boolean {
  if (!g.hasDates || g.hasWindowWarning || g.loading || g.areaTooLarge) return false
  const rankedReady = g.needsPolygon ? g.polygonReady : g.hasCustom
  return rankedReady || g.hasPins
}
