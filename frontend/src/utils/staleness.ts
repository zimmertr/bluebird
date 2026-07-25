import { SortBy } from '../types'

// True when the panel's ranking knobs no longer match the analysis on screen.
// The displayed report deliberately renders from the analyzed snapshot (knob
// changes never mutate it until the next Analyze), so this is the signal for
// a "press Analyze to apply" cue — without it the ranking controls feel dead
// the moment results are up.
export function rankingStale(
  analyzed: { sortBy: SortBy; sortDesc: boolean } | null,
  sortBy: SortBy,
  sortDesc: boolean,
): boolean {
  return analyzed !== null && (analyzed.sortBy !== sortBy || analyzed.sortDesc !== sortDesc)
}
