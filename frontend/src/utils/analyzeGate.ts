// Whether the Analyze button should be enabled.
//
// There are three ways to give Analyze something to do, and they're additive:
//   - A *drawn polygon* — discovers destinations of the chosen type inside it.
//     The app's core query.
//   - A *custom-CSV list* — unioned into the same ranked report, with or
//     without a polygon.
//   - A *pinned search* — one or more places searched and pinned to the table.
//     A pin alone enables Analyze too, which then just refetches the pinned
//     forecasts onto the currently-set window.
//
// Any input enables the button, but the shared guards veto them all: the
// forecast window must be servable, and any drawn polygon must be within the
// area cap. Keeping this as a pure function (rather than inline JSX) is what
// lets it be unit-tested — the frontend suite runs in a bare node environment
// with no component rendering.
//
// There is no "has a window been set" guard anymore. The calendar always holds
// one — the current hour if the user never touched it (#166) — where the three
// pickers each had their own way of being half-filled.
export interface AnalyzeGate {
  hasWindowWarning: boolean
  loading: boolean
  areaTooLarge: boolean
  polygonReady: boolean
  hasCustom: boolean
  hasPins: boolean
}

export function canAnalyze(g: AnalyzeGate): boolean {
  if (g.hasWindowWarning || g.loading || g.areaTooLarge) return false
  return g.polygonReady || g.hasCustom || g.hasPins
}
