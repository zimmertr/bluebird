// What the panel is asking about, as one value, and the reducers a click, a
// drag or a switch of arm applies to it. Reducers rather than handlers in
// `ForecastCalendar.tsx`, because what a click means given a pending anchor is
// the part most likely to regress, and the node project can pin it here.

import { nowLocal } from './datetimeLocal'
import { DAY_END, DAY_START, orderDays } from './calendarDates'
import { type BandLimits, bandEnd, bandStart } from './calendarBand'

/** Narrowed hours within a day selection, local, `HH:MM`. */
export interface DayHours {
  start: string
  end: string
}

/**
 * What the panel is asking about, as one value.
 *
 * `now` is the Analyze-click moment — no input of its own, which is why it is
 * the landing state (#161). `days` is one or more whole calendar days,
 * optionally narrowed to a span of hours. The two are mutually exclusive by
 * construction rather than by convention, which is what replaced the three
 * radios and their three parallel sets of live state.
 *
 * `hours` present means the narrow-hours disclosure is open; absent means whole
 * days. It applies once across the whole selection, not per day: `startDate` at
 * `hours.start` through `endDate` at `hours.end` is a single contiguous window,
 * because that is the only shape the backend's contiguous hourly filter can
 * express. Per-day masking (daylight hours on each of five days) is a real
 * feature and a real backend lift; it gets its own issue rather than a
 * misleading label here.
 */
export type ForecastSelection =
  | { kind: 'now' }
  | { kind: 'days'; startDate: string; endDate: string; hours?: DayHours }
  // The Dates arm freshly opened, before any day is picked (#242 review):
  // today is outlined but NOT selected — pre-selecting it painted the current
  // date as chosen the moment the picker opened, and "today" is what Current
  // already provides. No window exists in this state, so Analyze blocks on it.
  | { kind: 'days'; startDate: null; endDate: null; hours?: DayHours }

/** Which of the two shapes an analysis was, recorded on its snapshot. */
export type SelectionKind = ForecastSelection['kind']

/** The landing state: answerable with no input at all. */
export const DEFAULT_SELECTION: ForecastSelection = { kind: 'now' }

/**
 * Where a drag that starts on `day` should pivot.
 *
 * Grabbing either end of an existing range anchors on the *other* end, so
 * dragging an end adjusts that end instead of starting a new selection. That is
 * the "easy support for changing the dates around" the maintainer asked for,
 * and it costs one comparison rather than a pair of drag handles.
 */
export function dragAnchor(current: ForecastSelection, day: string): string {
  if (current.kind === 'days' && current.startDate !== current.endDate) {
    if (day === current.startDate) return current.endDate
    if (day === current.endDate) return current.startDate
  }
  return day
}

/** Carry a narrow-hours refinement across a change of days. */
function withHours(
  days: { startDate: string; endDate: string },
  current: ForecastSelection,
): ForecastSelection {
  let hours = current.kind === 'days' ? current.hours : undefined
  // When the new span is a single day AND the hours are reversed,
  // drop the hours entirely. An overnight span (18:00 to 06:00) is
  // valid on a multi-day range but impossible on a single day.
  if (hours && days.startDate === days.endDate && hours.end <= hours.start) {
    hours = undefined
  }
  return { kind: 'days', ...days, ...(hours ? { hours } : {}) }
}

/**
 * A completed drag from `from` to `to`, ordered. Committed on pointerup, never
 * during the move: a selection is App state, and setting it several times a
 * second would re-render the panel and re-run every derivation hanging off it
 * for a range the user has not finished choosing. (The URL write behind it is
 * debounced since #219, so that part is no longer the reason.)
 */
export function applyDayDrag(
  current: ForecastSelection,
  from: string,
  to: string,
): ForecastSelection {
  return withHours(orderDays(from, to), current)
}

/**
 * One click on a day, and what it leaves pending.
 *
 * The anchor is the whole interaction model: a click with no anchor selects
 * that single day and leaves it anchored, so the next click on a different day
 * extends to a range. Once a range is complete the anchor is spent, which is
 * what makes a click inside an existing range restart at that day rather than
 * needing a Clear first.
 */
export function applyDayClick(
  current: ForecastSelection,
  anchor: string | null,
  day: string,
): { selection: ForecastSelection; anchor: string | null } {
  if (anchor !== null && anchor !== day) {
    return { selection: withHours(orderDays(anchor, day), current), anchor: null }
  }
  return { selection: withHours({ startDate: day, endDate: day }, current), anchor: day }
}

/**
 * A selection refitted to a band that moved underneath it, or null if it still
 * fits.
 *
 * Changing the forecast model moves the far edge, sometimes by twelve days:
 * a window picked under ECMWF is mostly outside HRRR's. Clamping rather than
 * refusing is the call the maintainer made, and it is the right one — the
 * alternative is a picker that rejects your model because of a window you chose
 * before you knew the model mattered, leaving you to fix the window first and
 * guess by how much.
 *
 * Both ends are clamped independently, which also settles the case where the
 * whole range sits past the new edge: both land on it, and a range that has
 * lost every day it named collapses to the last day still available rather than
 * to nothing. Returning null for "unchanged" is what lets the caller warn only
 * when something actually moved — an equality check on the result would fire on
 * every model change.
 *
 * `now` needs no clamp: it is the current hour, which every model reaches.
 */
export function clampSelection(
  selection: ForecastSelection,
  now: Date,
  band: BandLimits,
): ForecastSelection | null {
  if (!hasDates(selection)) return null
  const first = bandStart(now, band)
  const last = bandEnd(now, band)
  const clamp = (day: string): string => (day < first ? first : day > last ? last : day)
  const startDate = clamp(selection.startDate)
  const endDate = clamp(selection.endDate)
  if (startDate === selection.startDate && endDate === selection.endDate) return null
  return { ...selection, startDate, endDate }
}

/** A day selection with real days, which is what a mode switch remembers. */
export type DaysSelection = { kind: 'days'; startDate: string; endDate: string; hours?: DayHours }

/** The Dates arm with actual dates picked — the only shape with a window. */
export function hasDates(selection: ForecastSelection): selection is DaysSelection {
  return selection.kind === 'days' && selection.startDate !== null
}

/**
 * Picking an arm of the control directly, rather than by acting inside one.
 *
 * The two arms are not symmetric. Now is a constant, so switching to it is
 * total. Days names a range, and pressing it says only *that* you want days —
 * so this has to produce one. It restores the last range the user had, because
 * the round trip Days → Now → Days is a comparison people actually make and
 * losing the range to it is the whole cost of the trip. Only when there is no
 * such range does it open EMPTY, today outlined but nothing selected: a
 * pre-selected today painted the current date as chosen before the user chose
 * anything, and a window anchored on today is what Current already provides
 * (#242 review). Analyze blocks until a day is picked.
 *
 * A remembered range is run back through `clampSelection`, because the band may
 * have moved under it while Now was live: a range picked under ECMWF is mostly
 * outside HRRR's reach, and restoring it unclamped would put the selection
 * somewhere the grid draws as unpickable.
 *
 * Switching to the arm already live returns the selection untouched, so the
 * pressed half of the segment is inert rather than a way to lose your range.
 */
export function applyModeSwitch(
  kind: SelectionKind,
  current: ForecastSelection,
  remembered: DaysSelection | null,
  now: Date,
  band: BandLimits,
): ForecastSelection {
  if (kind === current.kind) return current
  if (kind === 'now') return { kind: 'now' }
  const next: ForecastSelection = remembered ?? { kind: 'days', startDate: null, endDate: null }
  return clampSelection(next, now, band) ?? next
}

/**
 * The window a selection asks about, as the `datetime-local` strings the rest
 * of the app already speaks (the horizon and air-quality warnings in
 * `calendarBand.ts`, and the ISO conversion in `App.tsx`).
 *
 * `now` reports the same moment twice: equal timestamps are how a point sample
 * travels, and the backend floors that to the hour containing it. A day
 * selection spans whole days unless narrowed. The Dates arm with nothing
 * picked has NO window, and returns null rather than inventing one — the
 * callers (warnings, Analyze) each have their own honest answer to "no
 * window yet".
 */
export function selectionLocalWindow(
  selection: ForecastSelection,
  now: Date,
): { start: string; end: string } | null {
  if (selection.kind === 'now') {
    const stamp = nowLocal(now)
    return { start: stamp, end: stamp }
  }
  if (!hasDates(selection)) return null
  const hours = selection.hours
  return {
    start: `${selection.startDate}T${hours ? hours.start : DAY_START}`,
    end: `${selection.endDate}T${hours ? hours.end : DAY_END}`,
  }
}
