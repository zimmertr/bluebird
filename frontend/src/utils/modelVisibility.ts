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
 * The rules live here rather than in `ModelsPicker.tsx` for the reason every
 * other decision in this feature does: Vitest runs with no DOM, so anything
 * left in a component is untestable by construction.
 */

/**
 * One model as the picker's Models popover knows it.
 *
 * A name and nothing else. The popover carries NO colour: a compared model is
 * not one colour on the chart — every (destination, model) pair has its own —
 * so a square here could only name one line out of however many that model
 * draws. A line is identified in the hover box, which gives every entry its
 * colour dot and its `1. Mount Rainier (ECMWF IFS)` name together.
 */
export interface VisibilityModel {
  id: string
  label: string
}

/** One row of the Models popover. */
export interface VisibilityRow extends VisibilityModel {
  visible: boolean
}

/**
 * Every model the sidebar picker has SELECTED, ranking first.
 *
 * The selection rather than the chart, so a model ticked before the next
 * Analyze already has a row: the popover answers "which of my models do I want
 * to look at", and that question does not wait on a fetch.
 *
 * A model this deployment does not publish gets no row, because there is
 * nothing to name it with and nothing will draw it.
 */
export function modelRows(
  models: readonly { id: string; label: string }[],
  ranking: string,
  compared: readonly string[],
): VisibilityModel[] {
  const published = (id: string) => models.find((m) => m.id === id)
  const rows: VisibilityModel[] = []
  const first = published(ranking)
  if (first) rows.push({ id: first.id, label: first.label })
  for (const id of compared) {
    if (id === ranking) continue
    const model = published(id)
    if (model) rows.push({ id: model.id, label: model.label })
  }
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
