// The mark a cell wears when its number is missing for a reason that is not
// the weather, and which columns can wear it.
//
// Two metrics can be empty without anything being wrong with the forecast. The
// freezing level is absent because five of the eight models publish no such
// variable (#295); snow depth is absent because the destination is outside the
// SNODAS grid, or because the pod holds no grid yet (#449). Neither is a gap in
// a series, so neither draws the dash a missing hour gets: a dash says "nothing
// there", and here there IS something to say, which is that the number was
// never available to begin with.
//
// One spelling, because three surfaces draw it — the table, the marker popup
// and the downloaded file — and a file read in a spreadsheet has nothing beside
// it saying what a blank was supposed to mean. What differs between the two
// metrics is the hover text, which is the CAUSE rather than the mark: the
// freezing level's names the models a reader can switch to, and snow depth has
// no such remedy, so it carries none (TJ, 2026-09-22).
//
// Pure, and here rather than in the table, for the reason every derivation in
// this repository is: Vitest runs node-env, so logic left inside a component is
// untestable by construction.

import { FAMILY_KEYS } from '../metrics'

/**
 * The columns this module speaks for, read off the families' own key lists so
 * a new aggregate could never be added in one place and missed here.
 */
const UNAVAILABLE_KEYS: ReadonlySet<string> = new Set<string>([
  ...FAMILY_KEYS.freeze,
  ...FAMILY_KEYS.snow,
])

export function isUnavailableKey(key: string): boolean {
  return UNAVAILABLE_KEYS.has(key)
}

/**
 * The mark itself, shared with the wildfire column's own two absences.
 */
export const UNAVAILABLE = 'N/A'

/**
 * What an empty cell reads, or null when the cell has a number and the
 * column's own formatter should render it.
 *
 * Whether a cell is empty is always read off the DATA and never off a list of
 * models or a coverage polygon: a model that starts publishing a freezing
 * level, or a grid that grows, then works with no code change.
 */
export function unavailableCellText(value: unknown): string | null {
  return value == null ? UNAVAILABLE : null
}
