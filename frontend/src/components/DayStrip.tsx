import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ACCENT, DAY, DAY_STRIP, RADIUS, SCRUBBER, SR_ONLY, TRANSPORT_PLAY } from '../styles'
import { IconPlay } from './icons'
import { scoreColor } from '../utils/colors'
import { dayKey } from '../utils/calendar/calendarDates'
import { DAY_MS } from '../utils/forecastWindow'
import { hourShort } from '../utils/score/headline'
import { SKY_BLOCKS } from '../utils/score/daySky'
import { clamp } from '../utils/numbers'
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
  /**
   * After a forecast whose window the strip still shows (record 0323): each
   * day's sky (`daySky`) in the score's ramp, the window's days widened, the
   * forecast player as a playhead the window's days scrub, and the meta row
   * with play, the hour and the model in place of `transport`.
   */
  zoom?: StripZoom | null
  /**
   * The days row alone, with no card, player or placement of its own, for a
   * phone's foot to hold over its Forecast button (record 0329).
   */
  bare?: boolean
}

export interface StripZoom {
  sky: ReadonlyMap<string, readonly (number | null)[]>
  range: { lo: number; hi: number } | null
  times: readonly number[]
  index: number
  onIndex: (index: number) => void
  playing: boolean
  onPlaying: (playing: boolean) => void
  /** The hour drawn, as the player reads it. */
  readout: string
  /** The slider's name, the player's own. */
  label: string
  /** The model the forecast came from, which opens the When card. */
  model: string
  onModel: () => void
}

const NO_SKY: readonly (number | null)[] = Array.from({ length: SKY_BLOCKS }, () => null)

/** The playhead's day and how far through it, from the hour drawn. */
function headAt(ms: number | undefined): { date: string; frac: number } | null {
  if (ms === undefined) return null
  const date = dayKey(new Date(ms))
  return { date, frac: (ms - dayDate(date).getTime()) / DAY_MS }
}

const systemClock = () => new Date()

/** A day's full name, which a screen reader reads where the cell shows an initial and a number. */
const dayName = (key: string) =>
  dayDate(key).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })

/**
 * The day strip at a desk's map foot (record 0311): every day ahead the model
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
export default function DayStrip({ selection, onSelection, band, transport, liftPx, now = systemClock, zoom = null, bare = false }: Props) {
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
  const inWindow = (date: string) => chosen !== null && date >= chosen.startDate && date <= chosen.endDate
  // The window's days widen to about half the strip, the prototype's share,
  // so an hour is a few pixels wide and easy to find.
  const windowCount = zoom === null ? 0 : days.filter((d) => inWindow(d.date)).length
  const share = Math.min(0.6, 0.22 + 0.17 * windowCount)
  const grow = windowCount === 0 ? 1 : (share * (days.length - windowCount)) / (windowCount * (1 - share))
  const head = zoom === null ? null : headAt(zoom.times[zoom.index])

  // A drag across the window's days moves the hour, as the prototype's does.
  const [scrubbing, setScrubbing] = useState(false)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  function indexAt(clientX: number): number | null {
    const z = zoomRef.current
    const skies = [...(rowRef.current?.querySelectorAll<HTMLElement>('[data-sky]') ?? [])]
    if (z === null || skies.length === 0 || z.times.length === 0) return null
    const sky =
      skies.find((el) => clientX <= el.getBoundingClientRect().right) ?? skies[skies.length - 1]
    const box = sky.getBoundingClientRect()
    const frac = clamp((clientX - box.left) / box.width, 0, 0.999)
    const ms = dayDate(sky.dataset.sky!).getTime() + frac * DAY_MS
    let best = 0
    for (let i = 1; i < z.times.length; i++) if (Math.abs(z.times[i] - ms) < Math.abs(z.times[best] - ms)) best = i
    return best
  }
  useEffect(() => {
    if (!scrubbing) return
    const move = (e: PointerEvent) => {
      const i = indexAt(e.clientX)
      if (i !== null) zoomRef.current?.onIndex(i)
    }
    const end = () => setScrubbing(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
  }, [scrubbing])
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

  const row = (
    <div ref={rowRef} role="group" aria-label="Forecast day" className={bare ? DAY_STRIP.rowBare : DAY_STRIP.row} onKeyDown={onKeyDown}>
      {days.map((d) => {
        const mark = stripMark(drawn, d.date)
        return (
          <button
            key={d.date}
            type="button"
            data-day={d.date}
            aria-pressed={mark !== null}
            tabIndex={d.date === stop ? 0 : -1}
            style={zoom !== null && inWindow(d.date) ? { flexGrow: grow } : undefined}
            onPointerDown={(e) => {
              // The main button alone; a Shift press is the click's below.
              if (e.button > 0 || e.shiftKey) return
              // Inside a forecast window a drag scrubs the hours.
              if (zoom !== null && inWindow(d.date)) {
                zoom.onPlaying(false)
                const i = indexAt(e.clientX)
                if (i !== null) zoom.onIndex(i)
                setScrubbing(true)
                return
              }
              setDrag({ from: d.date, anchor: dragAnchor(selection, d.date), to: d.date })
            }}
            onPointerEnter={() => setDrag((was) => (was ? { ...was, to: d.date } : was))}
            // A keyboard's press, and a Shift press with the mouse; a plain
            // press is the drag's, committed on pointerup.
            onClick={(e: MouseEvent<HTMLButtonElement>) => {
              setFocusDay(d.date)
              if (e.detail === 0 || e.shiftKey) pick(d.date, e.shiftKey)
            }}
            // Once the strip plays the window, its days wear the range's tint
            // end to end, the prototype's, so the sky inside them reads
            // rather than sitting in an accent block (record 0326).
            className={`${DAY_STRIP.day} ${RADIUS.control} ${d.today ? DAY.today : ''} ${
              zoom !== null && inWindow(d.date)
                ? `${DAY.full} ${DAY.range}`
                : mark === 'end'
                  ? DAY.selected
                  : mark === 'range'
                    ? `${DAY.full} ${DAY.range}`
                    : DAY.full
            }`}
          >
            <span aria-hidden="true" className={DAY_STRIP.weekday}>
              {d.weekday}
            </span>
            <span aria-hidden="true">{d.day}</span>
            {zoom !== null && (
              <span aria-hidden="true" data-sky={inWindow(d.date) ? d.date : undefined} className={DAY_STRIP.sky}>
                {(zoom.sky.get(d.date) ?? NO_SKY).map((v, i) => (
                  <span
                    key={i}
                    className={DAY_STRIP.skyCell}
                    style={v === null ? undefined : { backgroundColor: scoreColor(v, zoom.range) }}
                  />
                ))}
                {head !== null && head.date === d.date && (
                  <>
                    <span className={DAY_STRIP.head} style={{ left: `${head.frac * 100}%` }} />
                    <span className={DAY_STRIP.headTag} style={{ left: `${head.frac * 100}%` }}>
                      {hourShort(zoom.times[zoom.index])}
                    </span>
                  </>
                )}
              </span>
            )}
            {/* The day's full name is the button's, read where the cell
                shows an initial and a number. Hidden text rather than a
                label, so the name never disagrees with the visible letters. */}
            <span className={SR_ONLY}>{dayName(d.date)}</span>
          </button>
        )
      })}
    </div>
  )
  if (bare) return row

  return (
    <div
      // A popup keeps clear of the strip, as it did of the player.
      data-map-overlay=""
      className={DAY_STRIP.card}
      style={{ bottom: transportBottomPx(liftPx) }}
    >
      {row}
      {zoom !== null ? (
        <div className={DAY_STRIP.meta}>
          <button
            type="button"
            onClick={() => zoom.onPlaying(!zoom.playing)}
            aria-label={zoom.playing ? 'Pause the timeline' : 'Play the timeline'}
            aria-keyshortcuts="Space"
            className={`${ACCENT.fill} ${ACCENT.fillHover} ${TRANSPORT_PLAY} ${RADIUS.control} transition-colors`}
          >
            <IconPlay playing={zoom.playing} />
          </button>
          {/* The keyboard's way along the hours, the player's own slider,
              whose value a screen reader hears as the hour; the hour it
              shows wears its focus ring. */}
          <label className={DAY_STRIP.metaHour}>
            <input
              type="range"
              min={0}
              max={Math.max(0, zoom.times.length - 1)}
              step={1}
              value={zoom.index}
              onChange={(e) => zoom.onIndex(Number(e.target.value))}
              aria-label={zoom.label}
              aria-valuetext={zoom.readout}
              className={`${SCRUBBER} ${SR_ONLY}`}
            />
            <span aria-hidden="true">{zoom.readout}</span>
          </label>
          <button type="button" onClick={zoom.onModel} className={DAY_STRIP.model}>
            {zoom.model}
          </button>
        </div>
      ) : (
        transport
      )}
    </div>
  )
}
