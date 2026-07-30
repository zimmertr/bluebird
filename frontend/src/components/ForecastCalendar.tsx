import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  AQI_LIMIT_DAYS,
  DAY_END,
  DAY_START,
  DayCell,
  FUTURE_LIMIT_DAYS,
  ForecastSelection,
  PAST_LIMIT_DAYS,
  addDays,
  addMonths,
  applyDayClick,
  applyDayDrag,
  dayInMonth,
  dayKey,
  dragAnchor,
  isTimeOfDay,
  monthGrid,
  monthHasBandDay,
  monthKey,
  monthLabel,
  orderDays,
  selectionLocalWindow,
  selectionSummary,
  weekdayInitials,
  windowPhrase,
} from '../utils/calendar'
import { isPointSample } from '../utils/forecastWindow'
import { ACCENT_FILL, BUTTON_SECONDARY, DAY, FIELD, RADIUS, TEXT } from '../styles'

interface Props {
  selection: ForecastSelection
  onChange: (selection: ForecastSelection) => void
}

// A cell is 288px of panel width over seven columns, so ~41px square. Sizing it
// larger would need a wider panel than the 320px every breakpoint gives, and
// tap-target sizing across the panel is #160's job rather than something to
// settle one control at a time.
const CELL = 'flex h-10 items-center justify-center'

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
export default function ForecastCalendar({ selection, onChange }: Props) {
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
  // Focus follows the arrow keys, but only once one has been pressed: stealing
  // focus on mount would scroll the panel down to the calendar on every load.
  const keyboardNav = useRef(false)

  const cells = useMemo(() => monthGrid(month, now), [month, now])
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

  function commitClick(day: string) {
    const next = applyDayClick(selection, anchor, day)
    setAnchor(next.anchor)
    onChange(next.selection)
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
  const local = selectionLocalWindow(selection, now)
  const startMs = Date.parse(local.start)
  const endMs = Date.parse(local.end)

  function setHours(next: { start: string; end: string } | undefined) {
    if (selection.kind !== 'days') return
    const { startDate, endDate } = selection
    onChange({ kind: 'days', startDate, endDate, ...(next ? { hours: next } : {}) })
  }

  const prevMonth = addMonths(month, -1)
  const nextMonth = addMonths(month, 1)

  return (
    <div>
      {/* The Now chip and what is currently selected, on one line above the
          grid. Selecting a day clears the chip and vice versa: they are the two
          arms of one value, so neither can be "also" true. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          onClick={() => onChange({ kind: 'now' })}
          aria-pressed={selection.kind === 'now'}
          title="Analyze the current hour"
          className={`${TEXT.control} flex-shrink-0 px-3 py-1 ${RADIUS.pill} transition-colors ${
            selection.kind === 'now' ? ACCENT_FILL : 'bg-slate-700 hover:bg-slate-600'
          }`}
        >
          Now
        </button>
        <span className={`${TEXT.control} truncate`}>{selectionSummary(selection)}</span>
      </div>

      {/* Month navigation, bounded by the servable band rather than open-ended:
          paging into a month with nothing pickable in it is a dead end. */}
      <div className="mb-1 flex items-center justify-between">
        <MonthButton
          label="Previous month"
          glyph="‹"
          disabled={!monthHasBandDay(prevMonth, now)}
          onClick={() => setMonth(prevMonth)}
        />
        <span className={TEXT.subheading}>{monthLabel(month)}</span>
        <MonthButton
          label="Next month"
          glyph="›"
          disabled={!monthHasBandDay(nextMonth, now)}
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
            <span key={i} role="columnheader" className={`${CELL} ${TEXT.micro}`}>
              {initial}
            </span>
          ))}
        </div>
        {[0, 7, 14, 21, 28, 35].map((offset) => (
          <div key={offset} role="row" className="grid grid-cols-7">
            {cells.slice(offset, offset + 7).map((cell) => (
              <Day
                key={cell.date}
                cell={cell}
                drawn={drawn}
                focused={cell.date === focused}
                onPress={() => {
                  suppressClick.current = false
                  if (cell.disabled) return
                  setDrag({
                    origin: cell.date,
                    pivot: dragAnchor(selection, cell.date),
                    over: cell.date,
                  })
                }}
                onEnter={() => {
                  if (drag !== null && !cell.disabled) setDrag({ ...drag, over: cell.date })
                }}
                onActivate={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  if (cell.disabled) return
                  focusDay(cell.date)
                  commitClick(cell.date)
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <p className={`${TEXT.helper} mt-1`}>
        Selectable from {PAST_LIMIT_DAYS} days back to {FUTURE_LIMIT_DAYS} days ahead. A dot
        marks days past the {AQI_LIMIT_DAYS}-day air-quality forecast.
      </p>

      {selection.kind === 'days' && (
        <div className="mt-2">
          <button
            onClick={() => setHours(hours ? undefined : { start: DAY_START, end: DAY_END })}
            aria-expanded={hours !== undefined}
            className={`${TEXT.subheading} flex cursor-pointer items-center gap-1.5`}
          >
            <span aria-hidden="true" className={TEXT.micro}>
              {hours ? '▾' : '▸'}
            </span>
            Narrow hours
          </button>
          {hours && (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-2">
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
              {/* Spelled out because a range plus a pair of hours reads as "these
                  hours on each day", and it is not: it is one continuous window
                  from the first day's start to the last day's end, which is the
                  only shape the hourly filter can express. Per-day masking is
                  its own feature. */}
              <p className={TEXT.helper}>
                Analyzing {windowPhrase(startMs, endMs, isPointSample(startMs, endMs))}
                {selection.startDate !== selection.endDate &&
                  ', as one continuous window rather than these hours on each day'}
                .
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
      className={`${BUTTON_SECONDARY} px-2 py-0.5 leading-none disabled:cursor-not-allowed disabled:opacity-40`}
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
  const isEnd = drawn !== null && (cell.date === drawn.startDate || cell.date === drawn.endDate)
  const inRange =
    drawn !== null && !isEnd && cell.date > drawn.startDate && cell.date < drawn.endDate
  // Order matters: an end wears the selected fill even when it is also today or
  // an adjacent month's day, because being selected is the stronger statement.
  const state = cell.disabled
    ? DAY.disabled
    : isEnd
    ? DAY.selected
    : inRange
    ? DAY.range
    : cell.inMonth
    ? DAY.idle
    : DAY.outside

  return (
    <button
      role="gridcell"
      data-day={cell.date}
      // aria-disabled rather than the disabled attribute: an unpickable day must
      // still be reachable by arrow key, or focus skips holes and the grid stops
      // being navigable at the band's edges.
      aria-disabled={cell.disabled || undefined}
      aria-selected={isEnd || inRange}
      aria-label={cell.date}
      tabIndex={focused ? 0 : -1}
      onPointerDown={onPress}
      onPointerEnter={onEnter}
      onClick={onActivate}
      className={`${CELL} ${TEXT.control} flex-col gap-0.5 transition-colors ${
        cell.today ? DAY.today : ''
      } ${cell.disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${state} ${
        isEnd ? RADIUS.control : ''
      }`}
    >
      <span className="leading-none">{cell.day}</span>
      {/* Inherits the cell's own text color, so the mark stays legible against
          the idle, range and selected fills without three spellings of it. */}
      {cell.beyondAqi && !cell.disabled && (
        <span aria-hidden="true" className={`h-1 w-1 ${RADIUS.pill} bg-current opacity-70`} />
      )}
    </button>
  )
}
