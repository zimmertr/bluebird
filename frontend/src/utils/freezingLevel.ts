// The freezing-level column's one asymmetry with every other metric (#295):
// five of the eight forecast models publish no freezing level at all, so a
// cell can be empty because of the model rather than because of the weather.
//
// Pure, and here rather than in the table, for the reason the fire warnings
// are pure and in fireProximity.ts: Vitest runs this repo in the node
// environment, so anything left inside a component is untestable by
// construction. The table is wiring.

import { FAMILY_KEYS, NOUN } from '../metrics'

/**
 * The three columns this module speaks for, read off the family's own key list
 * so a fourth aggregate could never be added in one place and missed here.
 */
const FREEZE_KEYS: ReadonlySet<string> = new Set(FAMILY_KEYS.freeze)

export function isFreezeKey(key: string): boolean {
  return FREEZE_KEYS.has(key)
}

/**
 * What the mark means, for the cell's hover text.
 *
 * The three models are named because that is the one thing a reader can act
 * on: the model is a control in the panel, so the sentence is also the remedy.
 * Whether a model serves the variable is read off the DATA, never off this
 * list — a model that starts publishing it works with no code change, and
 * only this sentence would then be behind.
 *
 * Composed from the metric's own noun rather than spelling it, like every
 * other surface (see metrics.ts).
 */
export const FREEZE_UNAVAILABLE_NOTE = `${NOUN.freeze} is only available from the GFS Seamless, HRRR and ICON models.`

/**
 * What an empty freezing-level cell reads, or null when the cell has a number
 * and the column's own formatter should render it.
 *
 * `N/A` rather than the dash a missing AQI gets, and the same idiom the
 * wildfire column uses for a row it could not check: a dash says "nothing
 * there", and here there is something to say — the number exists, this model
 * does not carry it. The hover text is what says which.
 */
export function freezeCellText(value: unknown): string | null {
  return value == null ? 'N/A' : null
}
