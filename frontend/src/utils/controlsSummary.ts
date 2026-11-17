import type { SelectionKind } from './calendar/calendarSelection'
import { NOUN, SEP, familyOf } from '../metrics'
import type { SortBy } from '../types'

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

/**
 * The three sections of the controls, by the anchor each one's `<section>`
 * carries. At a desk the card shows one of them open at a time and the others
 * as a one-line summary (#825; record 0305).
 */
export type PanelSectionId = 'destinations' | 'forecast' | 'metrics'
export const PANEL_SECTIONS: readonly PanelSectionId[] = ['destinations', 'forecast', 'metrics']

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

/**
 * The Destinations section's line while it is collapsed (the maintainer's
 * approved words, 2026-11-16): `None yet` until the reader has named
 * anything, then what they named, each part joined by the middle dot. A
 * ring reads as its point count and the kinds it looks for (`6 points ·
 * Peaks`), a picked list as its own name, and every other point destination,
 * pasted or picked on the map, in one count (`12 destinations`).
 */
export function destinationsSummary({
  ringPoints,
  kinds,
  listName,
  pointDestinations,
}: {
  /** The ring's points, drawn or being drawn. */
  ringPoints: number
  /** The kinds ticked for the ring, by the word each box shows, in the row's order. */
  kinds: readonly string[]
  /** The list the coordinates box holds whole, or null. */
  listName: string | null
  /** The point destinations no list accounts for: pasted rows and places picked on the map. */
  pointDestinations: number
}): string {
  const parts: string[] = []
  if (ringPoints > 0) parts.push(counted(ringPoints, 'point'), ...(kinds.length > 0 ? [kinds.join(', ')] : []))
  if (listName !== null) parts.push(listName)
  if (pointDestinations > 0) parts.push(counted(pointDestinations, 'destination'))
  return parts.length === 0 ? 'None yet' : parts.join(` ${SEP} `)
}

/**
 * The Metrics section's line while it is collapsed, `AQI · Lowest · 200`:
 * the metric that ranks, the direction by the word its half of the segment
 * shows, and how many rows are shown. Three words the section already shows.
 */
export function metricsSummary(sortBy: SortBy, direction: string, limit: number): string {
  return [NOUN[familyOf(sortBy)], direction, limit].join(` ${SEP} `)
}
