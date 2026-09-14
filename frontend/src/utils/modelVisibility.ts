/**
 * Which of the selected models the chart draws, and what colour each draws in
 * (#232).
 *
 * A comparison of three models over three destinations is nine lines, and a
 * reader who wants to read one model against another has no way to put the
 * third down. Hiding is the answer, and it is PRESENTATION and nothing else:
 * the forecasts are already bought, so a hidden model costs nothing to bring
 * back, spends nothing when it goes, and rides in no link — a shared chart is
 * the comparison that was bought, not one reader's view of it.
 *
 * It is also where a model's line COLOUR is decided, once, off the sidebar
 * picker's selection. The Models popover and the chart read the same call, so
 * a swatch and the lines it keys cannot be assigned from two different lists.
 *
 * The rules live here rather than in `ModelsPicker.tsx` for the reason every
 * other decision in this feature does: Vitest runs with no DOM, so anything
 * left in a component is untestable by construction.
 */

import { modelColor } from './chartColors'

/** One model as the picker's Models popover knows it. */
export interface VisibilityModel {
  id: string
  label: string
  /** Its line colour, or null for the ranking model, whose lines wear their destinations'. */
  color: string | null
}

/** One row of the Models popover. */
export interface VisibilityRow extends VisibilityModel {
  visible: boolean
}

/**
 * Every model the sidebar picker has SELECTED, ranking first, each with the
 * colour its lines wear.
 *
 * The selection rather than the chart, so a model ticked before the next
 * Analyze already has a row: the popover answers "which of my models do I want
 * to look at", and that question does not wait on a fetch. It is also the one
 * assignment of model colours in the app — the chart takes its line colours
 * from this same call — so a row's swatch is the colour that model's lines
 * wear, or will wear once the Analyze that buys them lands.
 *
 * The ranking model carries no colour: its lines are not one colour, each
 * wears its own destination's. A model this deployment does not publish gets
 * no row, because there is nothing to name it with and nothing will draw it.
 *
 * The one moment the rows and the chart can disagree is between changing the
 * ranking model and re-analysing, when the chart is still drawing the OLD
 * ranking model's lines in the destinations' colours while its row here has
 * become a compared model's. The `model-changed` cue is up throughout, and the
 * swatch is right about the report the panel is asking for.
 */
export function modelRows(
  models: readonly { id: string; label: string }[],
  ranking: string,
  compared: readonly string[],
  destinationColors: readonly string[],
): VisibilityModel[] {
  const published = (id: string) => models.find((m) => m.id === id)
  const rows: VisibilityModel[] = []
  const first = published(ranking)
  if (first) rows.push({ id: first.id, label: first.label, color: null })
  compared
    .filter((id) => id !== ranking && published(id) !== undefined)
    .forEach((id, i) => {
      rows.push({
        id,
        label: published(id)?.label ?? id,
        color: modelColor(destinationColors, i),
      })
    })
  return rows
}

/**
 * Those rows, each carrying whether its lines are showing.
 *
 * The order is the caller's, which is `modelRows`'. Listing them any other way
 * would make the popover a second opinion about a list the panel settles.
 */
export function visibilityRows(
  models: readonly VisibilityModel[],
  hidden: ReadonlySet<string>,
): VisibilityRow[] {
  return models.map((model) => ({ ...model, visible: !hidden.has(model.id) }))
}

/**
 * The models whose lines are drawn.
 *
 * Every box may be unticked. An empty chart is the honest answer to "hide
 * everything", and a floor would be a rule the reader has to discover by
 * pressing something that does not respond.
 */
export function shownModels<T extends { id: string }>(
  models: readonly T[],
  hidden: ReadonlySet<string>,
): T[] {
  return models.filter((model) => !hidden.has(model.id))
}

/** Hide a model, or show it again. */
export function toggleHidden(hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * The hidden set with flags for models nobody has selected any more dropped.
 *
 * A model put down and later picked up again comes back DRAWN. The alternative
 * is a model that returns invisible because of a decision taken about a chart
 * that no longer exists, which reads as the comparison silently failing to
 * arrive.
 *
 * Null means nothing was dropped, so a caller can skip the write rather than
 * setting state on every render the selection did not move.
 */
export function pruneHidden(
  hidden: ReadonlySet<string>,
  selected: readonly string[],
): Set<string> | null {
  const keep = new Set(selected)
  const next = new Set([...hidden].filter((id) => keep.has(id)))
  return next.size === hidden.size ? null : next
}
