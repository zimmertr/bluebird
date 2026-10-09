// The mark a cell wears when its number is missing for a reason that is not
// the weather, and which columns can wear it.
//
// Two metrics can be empty without anything being wrong with the forecast: the
// freezing level is absent because five of the eight models publish no such
// variable (#295), and the wind gust because one does not (JMA, #584). That is
// not a gap in a series, so it does not draw the dash a missing hour gets: a
// dash says "nothing there", and here there IS something to say, which is that
// the number was never available to begin with. Snow depth wore the same mark
// until it left the table (#449, #678).
//
// One spelling, because three surfaces draw it — the table, the marker popup
// and the downloaded file — and a file read in a spreadsheet has nothing beside
// it saying what a blank was supposed to mean. The hover text is the CAUSE
// rather than the mark, and lives with the freezing level's own note; the gust
// carries none, as snow depth carried none, because no cause sentence has been
// approved for it.
//
// Pure, and here rather than in the table, for the reason every derivation in
// this repository is: Vitest runs node-env, so logic left inside a component is
// untestable by construction.

import { FAMILY_KEYS } from '../metrics'

/**
 * The columns this module speaks for, read off the freezing level's own key
 * list so a new aggregate could never be added in one place and missed here.
 * The gust is one column of the wind's, named on its own because the wind's
 * other three always have a number (#584).
 */
const UNAVAILABLE_KEYS: ReadonlySet<string> = new Set<string>([
  ...FAMILY_KEYS.freeze,
  'wind_gust_mph',
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
 * models: a model that starts publishing a freezing level or a gust then works
 * with no code change.
 */
export function unavailableCellText(value: unknown): string | null {
  return value == null ? UNAVAILABLE : null
}
