/**
 * Which of the models on the chart are drawn (#232).
 *
 * A comparison of three models over three destinations is nine lines, and a
 * reader who wants to read one model against another has no way to put the
 * third down. Hiding is the answer, and it is PRESENTATION and nothing else:
 * the forecasts are already bought, so a hidden model costs nothing to bring
 * back, spends nothing when it goes, and rides in no link — a shared chart is
 * the comparison that was bought, not one reader's view of it.
 *
 * The rules live here rather than in `ModelsPicker.tsx` for the reason every
 * other decision in this feature does: Vitest runs with no DOM, so anything
 * left in a component is untestable by construction.
 */

/** One model as the chart knows it: `ComparedModel` minus what this needs not read. */
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
 * The rows the popover lists: every model on the chart, in the order the chart
 * draws them, each carrying whether its lines are showing.
 *
 * The order is the caller's, which is the ranking model first and then every
 * compared model in the picker's editorial order. Listing them any other way
 * would make the popover a second opinion about a list the panel already
 * settles.
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
