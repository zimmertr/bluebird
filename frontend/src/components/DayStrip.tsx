import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { DAY, DAY_STRIP, RADIUS, SR_ONLY } from '../styles'
import {
  type BandLimits,
  type ForecastSelection,
  applyDayDrag,
  dayDate,
  dragAnchor,
  orderDays,
  selectedDays,
  stripDays,
  stripMark,
} from '../utils/calendar/calendar'
import { transportBottomPx } from '../utils/results/resultsSheet'

interface Props {
  selection: ForecastSelection
  onSelection: (s: ForecastSelection) => void
  /** The band the When card's calendar is drawn over (`useForecastBand`). */
  band: BandLimits
  /** The forecast player, hosted under the row once a report spans hours, or null. */
  transport: ReactNode
  /** What covers the map's foot: 0 at a desk, where the results dock below it. */
  liftPx: number
  /** The clock, for a test. */
  now?: () => Date
}

const systemClock = () => new Date()

/** A day's full name, which a screen reader reads where the cell shows an initial and a number. */
const dayName = (key: string) =>
  dayDate(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

/**
 * The day strip at a desk's map foot (record 0310): every day ahead the model
 * reaches, one cell each, and the forecast player under them once a report
 * spans hours. A press picks a day and a drag picks a run of them, the
 * calendar's own reducers (`applyDayDrag`, `dragAnchor`), so a range's end
 * dragged moves that end. Shift extends the days from the window's first.
 * Before a run the days are plain, the maintainer's call (2026-11-17): nothing
 * here is forecast before the Forecast button spends.
 *
 * The days are one tab stop, and the arrows walk them, as the calendar's grid
 * does. It names itself as the calendar's grid does, so no new words.
 */
export default function DayStrip({ selection, onSelection, band, transport, liftPx, now = systemClock }: Props) {
  // The day changes under a tab left open overnight: read the clock with the
  // band, and once a minute is plenty for a row of days.
  const [clock, setClock] = useState(now)
  useEffect(() => {
    const id = setInterval(() => setClock(now()), 60_000)
    return () => clearInterval(id)
  }, [now])
  const days = useMemo(() => stripDays(clock, band), [clock, band])

  // A press in progress: the day pressed, where a drag from it pivots, and
  // where the pointer is. The selection commits on pointerup, as the
  // calendar's does. A press that never left its day picks that day alone,
  // even on a range's end, where a drag moves the end.
  const [drag, setDrag] = useState<{ from: string; anchor: string; to: string } | null>(null)
  useEffect(() => {
    if (drag === null) return
    const end = () => {
      setDrag(null)
      onSelection(
        drag.to === drag.from
          ? applyDayDrag(selection, drag.from, drag.from)
          : applyDayDrag(selection, drag.anchor, drag.to),
      )
    }
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [drag, onSelection, selection])

  const chosen = selectedDays(selection)
  const drawn = drag === null ? chosen : drag.to === drag.from ? orderDays(drag.from, drag.from) : orderDays(drag.anchor, drag.to)

  // The roving stop: the window's first day on the strip, or today.
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const stop =
    focusDay !== null && days.some((d) => d.date === focusDay)
      ? focusDay
      : chosen !== null && days.some((d) => d.date === chosen.startDate)
        ? chosen.startDate
        : days[0]?.date
  const rowRef = useRef<HTMLDivElement>(null)

  function pick(date: string, extend: boolean) {
    if (extend && chosen !== null) onSelection(applyDayDrag(selection, chosen.startDate, date))
    else onSelection(applyDayDrag(selection, date, date))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = days.findIndex((d) => d.date === stop)
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : step !== 0 ? at + step : -1
    if (next < 0 || next >= days.length) return
    e.preventDefault()
    const date = days[next].date
    setFocusDay(date)
    rowRef.current?.querySelector<HTMLButtonElement>(`[data-day="${date}"]`)?.focus()
  }

  return (
    <div
      // A popup keeps clear of the strip, as it did of the player.
      data-map-overlay=""
      className={DAY_STRIP.card}
      style={{ bottom: transportBottomPx(liftPx) }}
    >
      <div ref={rowRef} role="group" aria-label="Forecast day" className={DAY_STRIP.row} onKeyDown={onKeyDown}>
        {days.map((d) => {
          const mark = stripMark(drawn, d.date)
          return (
            <button
              key={d.date}
              type="button"
              data-day={d.date}
              aria-pressed={mark !== null}
              tabIndex={d.date === stop ? 0 : -1}
              onPointerDown={(e) => {
                // The main button alone; a Shift press is the click's below.
                if (e.button > 0 || e.shiftKey) return
                setDrag({ from: d.date, anchor: dragAnchor(selection, d.date), to: d.date })
              }}
              onPointerEnter={() => setDrag((was) => (was ? { ...was, to: d.date } : was))}
              // A keyboard's press, and a Shift press with the mouse; a plain
              // press is the drag's, committed on pointerup.
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                setFocusDay(d.date)
                if (e.detail === 0 || e.shiftKey) pick(d.date, e.shiftKey)
              }}
              className={`${DAY_STRIP.day} ${RADIUS.control} ${d.today ? DAY.today : ''} ${
                mark === 'end' ? DAY.selected : mark === 'range' ? `${DAY.full} ${DAY.range}` : DAY.full
              }`}
            >
              <span aria-hidden="true" className={DAY_STRIP.weekday}>
                {d.weekday}
              </span>
              <span aria-hidden="true">{d.day}</span>
              {/* The day's full name is the button's, read where the cell
                  shows an initial and a number. Hidden text rather than a
                  label, so the name never disagrees with the visible letters. */}
              <span className={SR_ONLY}>{dayName(d.date)}</span>
            </button>
          )
        })}
      </div>
      {transport}
    </div>
  )
}
