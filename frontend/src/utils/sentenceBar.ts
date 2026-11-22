/**
 * The words on the map's sentence bar (record 0309): what a Forecast will
 * search, over which hours, and what the button will spend. Every string here
 * is in the PR's table for the maintainer's approval.
 */
import type { DiscoveryType } from '../types'
import type { AreaSource } from './searchArea'
import { grouped } from './numbers'
import { type ForecastSelection, selectionLocalWindow } from './calendar/calendarSelection'
import { windowCaption } from './calendar/calendarPhrases'
import { isPointSample } from './forecastWindow'

const KIND_PLURAL: Readonly<Record<DiscoveryType, string>> = {
  peak: 'peaks',
  lake: 'lakes',
  crag: 'crags',
  trailhead: 'trailheads',
}

// The order the kinds are named in, whatever order they were ticked in.
const KIND_ORDER: readonly DiscoveryType[] = ['peak', 'lake', 'crag', 'trailhead']

/** `Peaks`, `Peaks and lakes`, `Peaks, lakes and crags`. */
export function kindsPhrase(types: readonly DiscoveryType[]): string {
  const names = KIND_ORDER.filter((t) => types.includes(t)).map((t) => KIND_PLURAL[t])
  const phrase =
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return phrase.charAt(0).toUpperCase() + phrase.slice(1)
}

/** The Where chip: what a Forecast will look for, and where. */
export function whereLabel(types: readonly DiscoveryType[], source: AreaSource, listed: number): string {
  const { what, area } = wherePhrases(types, source, listed)
  return area === null ? what : `${what} in ${area}`
}

/**
 * The sentence's what and where as the bar draws them, two phrases with
 * `in` between (record 0314): `Peaks` in `this view`. A list, or no kind
 * ticked, is one phrase with no place after it.
 */
export function wherePhrases(
  types: readonly DiscoveryType[],
  source: AreaSource,
  listed: number,
): { what: string; area: string | null } {
  if (source === 'list' || types.length === 0) return { what: listed > 0 ? 'Your list' : 'Choose what to find', area: null }
  return { what: kindsPhrase(types), area: source === 'view' ? 'this view' : 'your area' }
}

/**
 * The word before the When phrase: `on` before days, `for` before the
 * Current arm's `this hour` (TJ, 2026-11-21), since Current forecasts the
 * hour of the press.
 */
export function whenWord(selection: ForecastSelection): string {
  return selection.kind === 'now' ? 'for' : 'on'
}

/** The Current arm's hours in the sentence: `Peaks in this view for this hour`. */
export const THIS_HOUR = 'this hour'

/** The button's words when a press would fetch nothing new, which it draws as an outline. */
export const UP_TO_DATE = 'Up to date'

function plural(noun: string, n: number): string {
  return n === 1 ? noun : `${noun}s`
}

export interface ForecastLabelInputs {
  /** How many destinations a run would forecast, or null while unknown. */
  count: number | null
  /** How many of those the held report has no forecast for, or null with no report. */
  fresh: number | null
  /** `peak`, `lake`, or `destination` for a mix (`discoveryNoun`). */
  noun: string
}

/**
 * The Forecast button's words: `Forecast 247 peaks` ahead of a first run,
 * `Forecast 31 new` once a report holds the rest, `Up to date` when it holds
 * them all, and `Forecast` while the count is unknown.
 */
export function forecastLabel({ count, fresh, noun }: ForecastLabelInputs): string {
  if (fresh !== null) {
    if (fresh === 0) return UP_TO_DATE
    return `Forecast ${grouped(fresh)} new`
  }
  if (count === null) return 'Forecast'
  return `Forecast ${grouped(count)} ${plural(noun, count)}`
}

/**
 * The When chip: the window in the words the results bar prints for an
 * analysed one (`windowCaption`), `this hour` for the Current arm, or a
 * prompt for the Dates arm with no day picked.
 */
export function whenLabel(selection: ForecastSelection, now: Date): string {
  if (selection.kind === 'now') return THIS_HOUR
  const local = selectionLocalWindow(selection, now)
  if (local === null) return 'Pick the days'
  const startMs = Date.parse(local.start)
  const endMs = Date.parse(local.end)
  return windowCaption('days', startMs, endMs, isPointSample(startMs, endMs), now)
}
