/**
 * Which forecast models the picker has selected, and which one of them ranks.
 *
 * The picker holds two facts about one set: every model the chart draws, and
 * the one among them whose numbers ARE the report. The rules that move between
 * those two facts live here rather than in `ModelPicker.tsx`, because Vitest
 * runs with no DOM and anything left in the component is untestable by
 * construction.
 *
 * Three invariants hold over every function below, and the picker leans on all
 * three: the selected set is never empty, the ranking model is always in it,
 * and `compared` never holds the ranking model. The last one is what lets the
 * chart treat `compared` as the EXTRA lines beside the report's own.
 *
 * Order is editorial throughout. `/api/capabilities` publishes the models in
 * `MODEL_INFO`'s declaration order, which is a ranking for mountain terrain
 * rather than a sort, so the chips read in that order however they were ticked
 * — and so a link written from them means the same thing whoever built it. An
 * id the server did not publish keeps its place at the end rather than being
 * dropped, since a link naming an unknown model is still that reader's link.
 */

/** The one field these rules read off a published model. */
export interface OrderedModel {
  id: string
}

export interface ModelSelection {
  /** The model whose numbers rank the field. Always selected. */
  ranking: string
  /** Every other selected model, in editorial order. Never holds `ranking`. */
  compared: string[]
}

/** Where a model sits in the published order; unpublished ids sort last. */
function editorialRank(models: readonly OrderedModel[], id: string): number {
  const at = models.findIndex((m) => m.id === id)
  return at < 0 ? Number.MAX_SAFE_INTEGER : at
}

/**
 * Every selected model, in editorial order: the chips, left to right.
 *
 * The ranking model is included, because a chip row that hid it would leave the
 * reader no way to say which model ranks now.
 */
export function selectedIds(
  models: readonly OrderedModel[],
  ranking: string,
  compared: readonly string[],
): string[] {
  const unique = [...new Set([ranking, ...compared])]
  return unique
    .map((id, at) => ({ id, rank: editorialRank(models, id), at }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((entry) => entry.id)
}

/** The same order, minus the ranking model: what `compare=` carries. */
export function orderCompared(
  models: readonly OrderedModel[],
  ranking: string,
  compared: readonly string[],
): string[] {
  return selectedIds(models, ranking, compared).filter((id) => id !== ranking)
}

/**
 * Can this selection give a model up at all?
 *
 * False when one model is selected. The list can never be empty — a report has
 * to come from some model — so the last chip renders no × and its row's box is
 * disabled rather than silently doing nothing.
 */
export function canRemove(ranking: string, compared: readonly string[]): boolean {
  return compared.some((id) => id !== ranking)
}

/**
 * May THIS chip's × act?
 *
 * Not on the ranking chip: the highlight has to land somewhere, so the model
 * in force leaves by its row rather than by a button that would have to decide
 * where the ranking goes without saying so. Not on the only chip either, for
 * the reason above. The slot stays drawn in both cases — an × that came and
 * went would resize two chips every time the highlight moved — so this is what
 * separates a held slot from a control.
 */
export function chipRemovable(
  ranking: string,
  compared: readonly string[],
  id: string,
): boolean {
  return id !== ranking && canRemove(ranking, compared)
}

/**
 * Tick or untick one row, which is also what a chip's × does.
 *
 * Unticking the ranking model is the one case that moves the ranking: it passes
 * to the next chip to the right, wrapping to the first. Right rather than left
 * because the chips read in editorial order, so the neighbour on the right is
 * the next model the list itself would have offered.
 */
export function toggleSelected(
  models: readonly OrderedModel[],
  ranking: string,
  compared: readonly string[],
  id: string,
): ModelSelection {
  const extras = compared.filter((k) => k !== ranking)
  if (id === ranking) {
    const chips = selectedIds(models, ranking, extras)
    if (chips.length < 2) return { ranking, compared: extras }
    const at = chips.indexOf(id)
    const left = chips.filter((k) => k !== id)
    const next = left[at] ?? left[0]
    return { ranking: next, compared: left.filter((k) => k !== next) }
  }
  if (extras.includes(id)) {
    return { ranking, compared: extras.filter((k) => k !== id) }
  }
  return { ranking, compared: orderCompared(models, ranking, [...extras, id]) }
}

/**
 * Put one selected model in force: what a tap on a chip's label does.
 *
 * The model it replaces stays selected. That is the opposite of what happens
 * when a row picks a new ranking model in a list with no chips — there the
 * reader asked for a different ranking and nothing else — but here the old
 * ranking model is a chip the reader is looking at, and taking it off the chart
 * as a side effect of moving the highlight would remove something they never
 * pointed at.
 */
export function rankWith(
  models: readonly OrderedModel[],
  ranking: string,
  compared: readonly string[],
  id: string,
): ModelSelection {
  if (id === ranking) return { ranking, compared: compared.filter((k) => k !== ranking) }
  const extras = compared.filter((k) => k !== ranking && k !== id)
  return { ranking: id, compared: orderCompared(models, id, [...extras, ranking]) }
}

/**
 * Which chip holds the keyboard after the one at `removed` goes.
 *
 * The chip that slid into its place, or the last one when it was the tail.
 * Focus has to land somewhere the reader can see: left on the removed chip's
 * button it falls to the body, and the next Delete presses nothing.
 */
export function chipFocusAfterRemoval(removed: number, remaining: number): number {
  if (remaining <= 0) return 0
  return Math.min(Math.max(removed, 0), remaining - 1)
}
