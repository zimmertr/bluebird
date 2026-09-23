// The forecast window as a calendar: the servable band, the month grid drawn
// over it, and the selection a click or a drag produces.
//
// Every function here is pure and local-time by construction, which is the
// whole reason the module exists: a pure function of a day and a clock is
// tested case by case with no render at all, so the calendar's rules live
// outside `ForecastCalendar.tsx` and the component is left with the wiring.
// That includes the interaction rules. What a click means given a pending
// anchor is the part most likely to regress, so it is a reducer here rather
// than a handler there.
//
// Local time is not incidental either. A calendar day is inherently local ("is
// August 3rd dry?"), while the backend does no timezone conversion at all and
// Open-Meteo is asked for UTC. So the browser owns the local-to-UTC edge, as it
// always has, and day arithmetic goes through the Date constructor's field
// overflow rather than adding 86,400,000 ms — a local day is 23 or 25 hours on
// a DST transition, and millisecond arithmetic would land on the wrong day.
//
// The calendar is five flat sibling modules, and this file re-exports them so
// every importer reads one name. Flat rather than a folder, because the style
// guardrails in `styles.test.ts` glob `./utils/*.ts` and a sub-folder would
// escape them.

export * from './calendarDates'
export * from './calendarBand'
export * from './calendarGrid'
export * from './calendarSelection'
export * from './calendarPhrases'
