import type { SelectionKind } from './calendar/calendarSelection'

/**
 * The When control's two arms, by the word each one shows.
 *
 * Spelled here rather than in `ForecastCalendar.tsx` since the phone's
 * Controls chip repeated the live arm's word (#696), which the sentence bar
 * replaced (record 0328). The calendar draws its segment from this.
 */
export const WHEN_ARM_LABEL: Readonly<Record<SelectionKind, string>> = {
  now: 'Current',
  // "Dates" rather than "Days" or "Range": this arm is silent about count and
  // about tense, and it has to be. It holds a single day as readily as
  // several, and most of the days it can reach are behind today, so anything
  // future-facing would mislabel most of the grid.
  days: 'Dates',
}
