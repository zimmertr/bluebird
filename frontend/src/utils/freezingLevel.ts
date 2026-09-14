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
 * The mark an empty freezing-level cell wears, on every surface that has one:
 * the table, the marker popup, and the downloaded file.
 *
 * `N/A` rather than the dash a missing AQI gets, and the same idiom the
 * wildfire column uses for a row it could not check: a dash says "nothing
 * there", and here there is something to say — the number exists, this model
 * does not carry it. The hover text is what says which, where a surface has
 * hover to give.
 */
export const FREEZE_UNAVAILABLE = 'N/A'

/**
 * What an empty freezing-level cell reads, or null when the cell has a number
 * and the column's own formatter should render it.
 */
export function freezeCellText(value: unknown): string | null {
  return value == null ? FREEZE_UNAVAILABLE : null
}

/**
 * The forecast models that publish a freezing level at all.
 *
 * **This is a list, and a list can go stale.** Everywhere a CELL is concerned,
 * the rule above still holds and the emptiness is read off the data. This
 * exists for the one job the data cannot do: deciding, BEFORE an analysis is
 * bought, whether the models the reader picked can answer the metric they are
 * ranking on. `/api/capabilities` publishes no per-variable flag (only label,
 * summary, grid, reach, regional, blend), so there is nothing to read instead.
 *
 * Measured at #295 and unchanged since: three of the eight. If a model starts
 * publishing the variable, adding its id here is the whole change — and until
 * someone does, the cost is that the panel blocks a comparison that would
 * have worked, which is visible and complained about rather than silent.
 */
export const FREEZE_MODEL_IDS: ReadonlySet<string> = new Set([
  'gfs_seamless',
  'gfs_hrrr',
  'icon_seamless',
])

/**
 * Which of the selected models cannot answer a freezing-level ranking.
 *
 * Takes the models rather than ids alone so the caller gets labels back: the
 * sentence names them, because the model is a control in the panel and naming
 * it is what makes the sentence about something the reader can see.
 */
export function modelsWithoutFreeze<T extends { id: string; label: string }>(
  selected: readonly T[],
): T[] {
  return selected.filter((m) => !FREEZE_MODEL_IDS.has(m.id))
}
