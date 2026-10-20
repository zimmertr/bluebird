// The mark a cell wears when its number is missing for a reason that is not
// the weather, and which columns can wear it.
//
// One metric can be empty without anything being wrong with the forecast: the
// freezing level is absent because five of the eight models publish no such
// variable (#295). That is not a gap in a series, so it does not draw the dash
// a missing hour gets: a dash says "nothing there", and here there IS
// something to say, which is that the number was never available to begin
// with. Snow depth wore the same mark until it left the table (#449, #678).
//
// One spelling, because three surfaces draw it — the table, the marker popup
// and the downloaded file — and a file read in a spreadsheet has nothing beside
// it saying what a blank was supposed to mean. The hover text is the CAUSE
// rather than the mark, and lives with the freezing level's own note.
//
// Pure, and here rather than in the table, for the reason every derivation in
// this repository is: Vitest runs node-env, so logic left inside a component is
// untestable by construction.

import { FAMILY_KEYS } from '../metrics'

/**
 * The columns this module speaks for, read off the families' own key lists so
 * a new aggregate could never be added in one place and missed here.
 */
const UNAVAILABLE_KEYS: ReadonlySet<string> = new Set<string>(FAMILY_KEYS.freeze)

export function isUnavailableKey(key: string): boolean {
  return UNAVAILABLE_KEYS.has(key)
}

/**
 * The mark itself, which every surface printing an unavailable value reads:
 * these cells, the Wildfire and Closure columns' unchecked and uncovered rows
 * on screen and in the file, and a point card's row its source left unfilled.
 * The linter's `unavailable-mark-one-home` check fails a second spelling.
 */
export const UNAVAILABLE = 'N/A'

/**
 * The other mark: the dash a value prints where the forecast simply has none,
 * a missing hour or a check with nothing to report. One spelling for every
 * cell, popup row and placeholder that draws it.
 */
export const NO_VALUE_MARK = '—'

/**
 * What an empty cell reads, or null when the cell has a number and the
 * column's own formatter should render it.
 *
 * Whether a cell is empty is always read off the DATA and never off a list of
 * models: a model that starts publishing a freezing level then works with no
 * code change.
 */
export function unavailableCellText(value: unknown): string | null {
  return value == null ? UNAVAILABLE : null
}
