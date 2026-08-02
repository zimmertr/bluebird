import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  DAY_END,
  DayCell,
  DaysSelection,
  ForecastSelection,
  SelectionKind,
  addDays,
  addMonths,
  applyDayClick,
  applyDayDrag,
  applyModeSwitch,
  dayInMonth,
  dayKey,
  dragAnchor,
  isTimeOfDay,
  monthGrid,
  monthHasBandDay,
  monthKey,
  monthLabel,
  orderDays,
  weekdayInitials,
} from '../utils/calendar'
import {
  ACCENT,
  BUTTON_SECONDARY,
  DAY,
  FIELD,
  RADIUS,
  SEGMENT,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SURFACE_GROUP,
  TEXT,
} from '../styles'

interface Props {
  selection: ForecastSelection
  onChange: (selection: ForecastSelection) => void
  // How far ahead the selected model still has data, from /api/capabilities.
  // The far edge of this grid is the model's, not the app's: HRRR reaches about
  // two days where ECMWF reaches fourteen, so the same calendar draws twelve
  // more disabled days for one than for the other.
  forecastHours: number
}

// What the Hours toggle opens on: this hour through the end of the day.
//
// Deliberately not 00:00-23:59, which is All Day and would make the toggle look
// broken. The current hour rather than the exact minute because the hourly filter
// is inclusive from whatever it is given, so 14:00 keeps the hour you are
// standing in and 14:37 silently drops it.
function defaultHours(now: Date): { start: string; end: string } {
  return { start: `${String(now.getHours()).padStart(2, '0')}:00`, end: DAY_END }
}

/** A drag in flight: where it started, what it pivots on, where it is now. */
interface Drag {
  origin: string
  pivot: string
  over: string
}

/**
 * The forecast window as a calendar (#166).
 *
 * One click picks a whole day, a second click extends to a range, and dragging
 * either end adjusts it. The interaction rules themselves live in
 * `utils/calendar.ts` as pure reducers, because Vitest runs with no DOM and a
 * component test would be silently uncollected — so this file is deliberately
 * only wiring: events in, reducer, `onChange` out.
 *
 * Drag works for a mouse and is a no-op for a finger, without a branch on
 * pointer type: touch gets implicit pointer capture, so `pointerenter` never
 * fires on the neighbouring cells and the gesture resolves as a tap on the day
 * it started from. That is also why the grid does not set `touch-none`, which
 * would have stopped the control panel itself from scrolling on a phone.
 */
export default function ForecastCalendar({ selection, onChange, forecastHours }: Props) {
  // Captured once: a grid that recomputed against a moving `now` would redraw
  // every render, and nothing here changes meaning within a session.
  const now = useMemo(() => new Date(), [])
  const today = dayKey(now)

  const [month, setMonth] = useState(() =>
    selection.kind === 'days' ? monthKey(selection.startDate) : monthKey(today),
  )
  // A committed single day that the next click may extend into a range. Spent
  // once a range exists, which is what makes a click inside one restart there.
  const [anchor, setAnchor] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  // A completed drag ends in a click event on the day it was released over;
  // without this the click path would immediately overwrite the range the drag
  // just committed. Cleared on the next press, so a drag released off the grid
  // cannot leave it armed.
  const suppressClick = useRef(false)
  const [focused, setFocused] = useState(() =>
    selection.kind === 'days' ? selection.startDate : today,
  )
  const gridRef = useRef<HTMLDivElement>(null)
  // The range to come back to when Days is pressed again. A ref rather than
  // state: nothing renders from it, and making it state would re-render the
  // panel on every day click to store what that click already displayed.
  const lastDays = useRef<DaysSelection | null>(
    selection.kind === 'days' ? selection : null,
  )
  // Focus follows the arrow keys, but only once one has been pressed: stealing
  // focus on mount would scroll the panel down to the calendar on every load.
  const keyboardNav = useRef(false)

  const weeks = useMemo(
    () => monthGrid(month, now, forecastHours),
    [month, now, forecastHours],
  )
  const weekdays = useMemo(() => weekdayInitials(), [])

  // The range being drawn: the drag in flight if there is one, else what is
  // selected. A preview lives here rather than in the selection so a drag never
  // touches App state at all. The URL write is debounced since #219, so a
  // per-pointermove selection would no longer reach Safari's `replaceState`
  // rate limit — but it would still re-render the whole panel and re-run every
  // derivation hanging off the selection, several times a second, for a range
  // the user has not finished choosing.
  const drawn =
    drag !== null
      ? orderDays(drag.pivot, drag.over)
      : selection.kind === 'days'
      ? { startDate: selection.startDate, endDate: selection.endDate }
      : null

  useEffect(() => {
    if (selection.kind === 'days') lastDays.current = selection
  }, [selection])

  function commitClick(day: string) {
    const next = applyDayClick(selection, anchor, day)
    setAnchor(next.anchor)
    onChange(next.selection)
  }

  function switchMode(kind: SelectionKind) {
    const next = applyModeSwitch(kind, selection, lastDays.current, now, forecastHours)
    if (next === selection) return
    // A half-made range does not survive leaving the arm it was being made in.
    setAnchor(null)
    if (next.kind === 'days') {
      // Restoring a range in another month has to page there, or pressing Days
      // shows an empty grid and the selection looks lost.
      setMonth(monthKey(next.startDate))
      setFocused(next.startDate)
    }
    onChange(next)
  }

  // Released anywhere, not just over the grid: a drag that ends off the calendar
  // still has to commit rather than leave a preview stuck on screen. A cancelled
  // pointer (the browser taking over for a scroll) abandons it instead.
  useEffect(() => {
    if (drag === null) return
    const finish = () => {
      setDrag(null)
      if (drag.over === drag.origin) return // a press and release on one day is a click
      suppressClick.current = true
      onChange(applyDayDrag(selection, drag.pivot, drag.over))
      setAnchor(null)
    }
    const abandon = () => setDrag(null)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', abandon)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', abandon)
    }
  }, [drag, selection, onChange])

  useEffect(() => {
    if (!keyboardNav.current) return
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }, [focused])

  function focusDay(day: string) {
    keyboardNav.current = true
    if (monthKey(day) !== month) setMonth(monthKey(day))
    setFocused(day)
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (e.key in step) {
      e.preventDefault()
      focusDay(addDays(focused, step[e.key]))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const target = addMonths(month, e.key === 'PageUp' ? -1 : 1)
      setMonth(target)
      keyboardNav.current = true
      setFocused(dayInMonth(target, Number(focused.slice(8))))
    } else if (e.key === 'Escape' && anchor !== null) {
      // Abandons a half-made range. The panel has no overlay to dismiss, so
      // unsticking the pending anchor is Escape's only job here.
      e.preventDefault()
      setAnchor(null)
    }
  }

  const hours = selection.kind === 'days' ? selection.hours : undefined

  function setHours(next: { start: string; end: string } | undefined) {
    if (selection.kind !== 'days') return
    const { startDate, endDate } = selection
    onChange({ kind: 'days', startDate, endDate, ...(next ? { hours: next } : {}) })
  }

  const prevMonth = addMonths(month, -1)
  const nextMonth = addMonths(month, 1)

  return (
    <div className={`${SURFACE_GROUP} p-2`}>
      {/* Both arms of the control, named, in the shape this panel already uses
          for a choice between two things — the same one the Hours row below the
          grid and the ranking direction toggle wear.

          Neither arm is an action, which is why neither is a button. A filled
          full-width bar here would carry the shape, weight and hue of Analyze
          further down the same panel, and only one of those two spends upstream
          quota; a secondary-button look would say the same thing more quietly.
          What is actually being expressed is which arm is live.

          The grid stays live under either arm, so clicking a day is still the
          one-click way into Days. This pair names the choice and is the way
          back, not a gate to open first. */}
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-700 pb-2">
        <span className={TEXT.subheading}>When</span>
        <div className={SEGMENT}>
          {[
            { kind: 'now' as const, label: 'Now', hint: 'Analyze conditions at the current hour' },
            { kind: 'days' as const, label: 'Days', hint: 'Analyze a day or a range of days' },
          ].map((option, i) => (
            <button
              key={option.kind}
              aria-pressed={selection.kind === option.kind}
              title={option.hint}
              onClick={() => switchMode(option.kind)}
              className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                selection.kind === option.kind ? ACCENT.fill : SEGMENT_IDLE
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Month navigation, bounded by the servable band rather than open-ended:
          paging into a month with nothing pickable in it is a dead end. */}
      <div className="mb-1 flex items-center justify-between">
        <MonthButton
          label="Previous month"
          glyph="‹"
          disabled={!monthHasBandDay(prevMonth, now, forecastHours)}
          onClick={() => setMonth(prevMonth)}
        />
        <span className={TEXT.subheading}>{monthLabel(month)}</span>
        <MonthButton
          label="Next month"
          glyph="›"
          disabled={!monthHasBandDay(nextMonth, now, forecastHours)}
          onClick={() => setMonth(nextMonth)}
        />
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-label="Forecast day"
        onKeyDown={onKeyDown}
        className="select-none"
      >
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((initial, i) => (
            <span key={i} role="columnheader" className={`${DAY.cell} ${TEXT.micro}`}>
              {initial}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} role="row" className="grid grid-cols-7">
            {week.map((cell) => (
              <Day
                key={cell.date}
                cell={cell}
                drawn={drawn}
                focused={cell.date === focused}
                onPress={() => {
                  suppressClick.current = false
                  if (!pickable(cell)) return
                  setDrag({
                    origin: cell.date,
                    pivot: dragAnchor(selection, cell.date),
                    over: cell.date,
                  })
                }}
                onEnter={() => {
                  if (drag !== null && pickable(cell)) setDrag({ ...drag, over: cell.date })
                }}
                onActivate={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  if (!pickable(cell)) return
                  focusDay(cell.date)
                  commitClick(cell.date)
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Hours, always visible once there is a day to apply them to. This was a
          collapsed disclosure and a reviewer got eight points into a review
          without finding it, which is the whole reason it now wears the same
          segmented look as the ranking direction toggle further down the panel. */}
      {selection.kind === 'days' && (
        <div className="mt-2 border-t border-slate-700 pt-2">
          <div className="flex items-center justify-between gap-2">
            <span className={TEXT.subheading}>Hours</span>
            <div className={SEGMENT}>
              {[
                { hourly: false, label: 'All Day' },
                { hourly: true, label: 'Hourly' },
              ].map((option, i) => (
                <button
                  key={option.label}
                  aria-pressed={option.hourly === (hours !== undefined)}
                  onClick={() => setHours(option.hourly ? hours ?? defaultHours(now) : undefined)}
                  className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                    option.hourly === (hours !== undefined) ? ACCENT.fill : SEGMENT_IDLE
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {hours && (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="time"
                aria-label="Window start time"
                value={hours.start}
                onChange={(e) =>
                  isTimeOfDay(e.target.value) && setHours({ ...hours, start: e.target.value })
                }
                className={`${FIELD} w-full px-2 py-1.5`}
              />
              <span className={`${TEXT.caption} flex-shrink-0`}>to</span>
              <input
                type="time"
                aria-label="Window end time"
                value={hours.end}
                onChange={(e) =>
                  isTimeOfDay(e.target.value) && setHours({ ...hours, end: e.target.value })
                }
                className={`${FIELD} w-full px-2 py-1.5`}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A day the user can act on. Unservable days are drawn, focusable, and inert. */
function pickable(cell: DayCell): boolean {
  return cell.inMonth && cell.availability !== 'unservable'
}

function MonthButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string
  glyph: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      // No padding of its own any more. It had been squeezed to a 16px-tall
      // sliver, which is smaller than anything else in the panel and is the
      // secondary action doing something the role does not do.
      className={`${BUTTON_SECONDARY} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}

function Day({
  cell,
  drawn,
  focused,
  onPress,
  onEnter,
  onActivate,
}: {
  cell: DayCell
  drawn: { startDate: string; endDate: string } | null
  focused: boolean
  onPress: () => void
  onEnter: () => void
  onActivate: () => void
}) {
  // Borrowed from an adjacent month: drawn to keep the grid six rows tall and the
  // columns aligned, but blank. It cannot mark itself by dimming, because dim
  // means "no air quality" here, and a bright unlabelled cell is a hole the eye
  // skips rather than a date it might try to click.
  if (!cell.inMonth) return <span className={DAY.cell} aria-hidden="true" />

  const isEnd = drawn !== null && (cell.date === drawn.startDate || cell.date === drawn.endDate)
  const inRange =
    drawn !== null && !isEnd && cell.date > drawn.startDate && cell.date < drawn.endDate
  const inert = cell.availability === 'unservable'
  // Availability owns the text color, selection owns the fill, so the two
  // compose: a day with no air quality stays dim inside a selected range. The
  // exception is an end, where white is what reads on the accent fill.
  const ramp = inert ? DAY.unservable : cell.availability === 'partial' ? DAY.partial : DAY.full

  return (
    <button
      role="gridcell"
      data-day={cell.date}
      // aria-disabled rather than the disabled attribute: an unpickable day must
      // still be reachable by arrow key, or focus skips holes and the grid stops
      // being navigable at the band's edges.
      aria-disabled={inert || undefined}
      aria-selected={isEnd || inRange}
      aria-label={cell.date}
      // Only where the cell's own appearance raises the question. Every day
      // already announces its date through aria-label, so a tooltip on all 42 of
      // them would be noise rather than help.
      title={
        inert
          ? 'Outside the range of history and forecast the weather service publishes.'
          : cell.availability === 'partial'
          ? 'Weather forecast available. Air quality reaches only about 5 days out, so those columns will be blank.'
          : undefined
      }
      tabIndex={focused ? 0 : -1}
      onPointerDown={onPress}
      onPointerEnter={onEnter}
      onClick={onActivate}
      className={`${DAY.cell} ${TEXT.control} transition-colors ${cell.today ? DAY.today : ''} ${
        inert ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${isEnd ? `${DAY.selected} ${RADIUS.control}` : inRange ? `${ramp} ${DAY.range}` : ramp}`}
    >
      {cell.day}
    </button>
  )
}
