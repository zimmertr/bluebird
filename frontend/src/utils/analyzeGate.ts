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
  // A polygon that is drawn, inside the area cap, AND has at least one type
  // checked. Without a type it discovers nothing, so it is not an input:
  // letting it enable Analyze would send a request the server answers with
  // "nothing to analyze".
  polygonReady: boolean
  hasCustom: boolean
  hasPins: boolean
}

export function canAnalyze(g: AnalyzeGate): boolean {
  if (g.hasWindowWarning || g.loading || g.areaTooLarge) return false
  return g.polygonReady || g.hasCustom || g.hasPins
}

/**
 * Everything currently holding Analyze back, rather than the first thing.
 *
 * The panel used to pick one reason out of a ternary chain, so a reader with
 * both an oversized polygon and an unservable window fixed the polygon and was
 * met by a second sentence that had been true the whole time. The guards in
 * `canAnalyze` above are independent, so the reasons are too, and the panel
 * stacks whatever this returns.
 *
 * Order is fixed rather than incidental: the two vetoes come first because they
 * are about work already done, and the missing-input line last because it is
 * the one that says the app has nothing to do at all.
 *
 * The polygon has two distinct unfinished states and never both at once. Under
 * three points it is being drawn, and "one more point" is a better instruction
 * than a general one; otherwise there is simply no destination yet. The one
 * case that gets neither line is an oversized polygon, which is a finished
 * polygon and already has its own entry above — a plain "not ready" test there
 * printed "add 0 more points" beside the real reason.
 *
 * The postcondition is that this is non-empty exactly when `canAnalyze` is
 * false, so the panel can never disable the button without saying why. It holds
 * over every combination of the flags, including ones the panel cannot actually
 * produce, because "unreachable" is a claim about a caller and this function
 * should not depend on one.
 */
export type AnalyzeBlocker = 'area' | 'window' | 'destinations' | 'polygon' | 'types'

export function analyzeBlockers(g: AnalyzeGate & { drawPointCount: number }): AnalyzeBlocker[] {
  // Mid-analysis the button is disabled because it is busy, which the button
  // says itself. Nothing here is a reason the reader can act on.
  if (g.loading) return []
  const blockers: AnalyzeBlocker[] = []
  if (g.areaTooLarge) blockers.push('area')
  if (g.hasWindowWarning) blockers.push('window')
  if (!g.polygonReady && !g.hasCustom && !g.hasPins) {
    if (g.drawPointCount > 0 && g.drawPointCount < 3) blockers.push('polygon')
    // A finished polygon with nothing checked is not an unfinished polygon
    // and not a missing destination — it is a search with nothing to look
    // for, and only one of the three lines can act on that.
    else if (g.drawPointCount >= 3 && !g.areaTooLarge) blockers.push('types')
    else if (!g.areaTooLarge) blockers.push('destinations')
  }
  return blockers
}
