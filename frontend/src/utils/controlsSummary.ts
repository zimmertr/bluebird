import type { SelectionKind } from './calendar/calendarSelection'

/**
 * The When control's two arms, by the word each one shows.
 *
 * Spelled here rather than in `ForecastCalendar.tsx`, because the phone's
 * Controls button repeats the live arm's word under its own (#696), and a
 * second spelling is a word that can be renamed in one place and not the
 * other. The calendar draws its segment from this; the summary reads it.
 */
export const WHEN_ARM_LABEL: Readonly<Record<SelectionKind, string>> = {
  now: 'Current',
  // "Dates" rather than "Days" or "Range": this arm is silent about count and
  // about tense, and it has to be. It holds a single day as readily as
  // several, and most of the days it can reach are behind today, so anything
  // future-facing would mislabel most of the grid.
  days: 'Dates',
}

/**
 * The line under the word on the phone's Controls button: which arm of When is
 * live and which model ranks, `Current · NOAA GFS` (#696). Two words the panel
 * already shows and nothing else, so it says what the panel is set to without
 * being a sentence of its own; the middle dot is the maintainer's composition.
 *
 * The model falls back to its id, as the panel's own sentences do, so a link
 * naming a model this deployment stopped publishing still reads as something.
 */
export function controlsSummary(
  kind: SelectionKind,
  models: readonly { id: string; label: string }[],
  modelId: string,
): string {
  const label = models.find((m) => m.id === modelId)?.label ?? modelId
  return `${WHEN_ARM_LABEL[kind]} · ${label}`
}
