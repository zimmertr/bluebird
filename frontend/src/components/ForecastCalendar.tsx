import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, Ref } from 'react'
import Popover from './Popover'
import { IconSelectArrow } from './icons'
import { usePopover } from '../hooks/usePopover'
import { isPointSample } from '../utils/forecastWindow'
import {
  type BandLimits,
  DAY_END,
  DayCell,
  DaysSelection,
  ForecastSelection,
  SelectionKind,
  addDays,
  addMonths,
  addOneHour,
  applyDayClick,
  applyDayDrag,
  applyModeSwitch,
  dayInMonth,
  dayKey,
  dragAnchor,
  hasDates,
  isTimeOfDay,
  monthGrid,
  monthHasBandDay,
  monthKey,
  monthLabel,
  orderDays,
  selectionLocalWindow,
  weekdayInitials,
  windowCaption,
} from '../utils/calendar'
import {
  ACCENT,
  BUTTON_ACCENT,
  BUTTON_SECONDARY,
  CALENDAR_FIELD,
  CALENDAR_GROUND,
  CONTROL_W,
  DAY,
  DISABLED,
  FIELD,
  RADIUS,
  SEGMENT,
  SEGMENT_DIVIDER,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SR_ONLY,
  SURFACE_DIVIDER,
  TEXT,
} from '../styles'
import { WHEN_ARM_LABEL } from '../utils/controlsSummary'

interface Props {
  selection: ForecastSelection
  onChange: (selection: ForecastSelection) => void
  // Both edges of the band this grid draws, from /api/capabilities. The far one
  // is the selected model's, not the app's: HRRR reaches about two days where
  // ECMWF reaches fourteen, so the same calendar draws twelve more disabled days
  // for one than for the other. The near one is the archive's reach (#123).
  band: BandLimits
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
 * The forecast window as a calendar (#166), behind a field (#687).
 *
 * Under Dates with a range picked the panel shows one field holding the
 * window in the words the results bar prints for it, and the field opens the
 * Hours row and the month grid as a popover on `Popover.tsx`'s card. The card
 * takes the field's place while it is open, and with no range there is no
 * field at all, only the card when Dates is pressed. The grid used to stand in the
 * panel body in a well, where choosing Dates grew the Forecast section from
 * 111px to 424px. Record 0129.
 *
 * One click picks a whole day, a second click extends to a range, and dragging
 * either end adjusts it. The interaction rules themselves live in
 * `utils/calendar.ts` as pure reducers, where the node test project checks
 * every case without a page. So this file is deliberately only wiring: events
 * in, reducer, `onChange` out, which is all `ForecastCalendar.test.tsx` has to
 * show.
 *
 * Drag works for a mouse and is a no-op for a finger, without a branch on
 * pointer type: touch gets implicit pointer capture, so `pointerenter` never
 * fires on the neighbouring cells and the gesture resolves as a tap on the day
 * it started from. That is also why the grid does not set `touch-none`, which
 * would have stopped the control panel itself from scrolling on a phone.
 */
// What Hourly actually does, which is not what the word suggests. The narrowed
// hours become the START time on the first chosen day and the END time on the
// last (`selectionLocalWindow`), so the window is one continuous run between
// them — the nights in the middle of a multi-day range are inside it. A reader
// who assumes "6 AM to 6 PM, every day" would be wrong about every day but the
// first and last, which is exactly why this says so.
const HOURS_NOTE =
  'Hourly sets the start time on the first day and the end time on the last day. Forecast data is inclusive.'

export default function ForecastCalendar({ selection, onChange, band }: Props) {
  // Captured once: a grid that recomputed against a moving `now` would redraw
  // every render, and nothing here changes meaning within a session.
  const now = useMemo(() => new Date(), [])
  const today = dayKey(now)
  const hoursNoteId = useId()

  const [month, setMonth] = useState(() =>
    hasDates(selection) ? monthKey(selection.startDate) : monthKey(today),
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
    hasDates(selection) ? selection.startDate : today,
  )
  const gridRef = useRef<HTMLDivElement>(null)
  // The range to come back to when Days is pressed again. A ref rather than
  // state: nothing renders from it, and making it state would re-render the
  // panel on every day click to store what that click already displayed.
  const lastDays = useRef<DaysSelection | null>(hasDates(selection) ? selection : null)
  // Focus follows the arrow keys, but only once one has been pressed: stealing
  // focus on mount would scroll the panel down to the calendar on every load.
  const keyboardNav = useRef(false)

  // The popover the grid lives in. Its state is this component's, not the
  // popover's, so the anchor, the page and the range to bring back survive a
  // close: closing the card is not leaving the Dates arm.
  const [open, setOpen] = useState(false)
  const fieldRef = useRef<HTMLButtonElement>(null)
  // Where the card stands: the slot under When, which is in the layout under
  // Dates whether or not the field is drawn in it, so the card's top is the
  // field's top, or where it would be.
  const slotRef = useRef<HTMLDivElement>(null)
  const datesRef = useRef<HTMLButtonElement>(null)
  // The When segment: a press on it is the arm switch's to handle, so the card
  // and the rows Dates draws leave in the one render that changes the arm.
  const segmentRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)
  // What the keyboard goes back to when the card closes: the field when there
  // is one, and the Dates arm when there is no range for a field to hold.
  // Read when it is needed, since the field mounts in the commit that closes
  // the card.
  const triggerRef = useMemo(
    () => ({
      get current(): HTMLElement | null {
        return fieldRef.current ?? datesRef.current
      },
    }),
    [],
  )
  // The day that takes the keyboard when the card opens, so a reader lands on
  // the dates rather than on the Hours row above them.
  const focusedDayRef = useRef<HTMLButtonElement>(null)
  const whenId = useId()
  const fieldTextId = useId()

  const weeks = useMemo(() => monthGrid(month, now, band), [month, now, band])
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
      : hasDates(selection)
      ? { startDate: selection.startDate, endDate: selection.endDate }
      : null

  useEffect(() => {
    if (hasDates(selection)) lastDays.current = selection
  }, [selection])

  function commitClick(day: string) {
    const next = applyDayClick(selection, anchor, day)
    setAnchor(next.anchor)
    onChange(next.selection)
  }

  function switchMode(kind: SelectionKind) {
    const next = applyModeSwitch(kind, selection, lastDays.current, now, band)
    if (next === selection) {
      // Dates pressed again with no range is the way back into a card that
      // was closed without a pick: there is no field to press instead.
      if (kind === 'days' && !hasDates(selection)) openCalendar()
      return
    }
    // A half-made range does not survive leaving the arm it was being made in.
    setAnchor(null)
    if (hasDates(next)) {
      // Restoring a range in another month has to page there, or pressing Days
      // shows an empty grid and the selection looks lost.
      setMonth(monthKey(next.startDate))
      setFocused(next.startDate)
    }
    // Dates with no range to bring back has no field to show, so the card
    // opens for the first pick. A restored range opens nothing: its field
    // already says what was chosen.
    if (next.kind === 'days' && !hasDates(next)) setOpen(true)
    if (next.kind === 'now') setOpen(false)
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

  // Escape, a press outside and Tab past an edge all close the card through
  // here. With no day picked there is nothing for Dates to hold, so the arm
  // goes back to Current rather than standing on Dates over an empty row (the
  // maintainer, 2026-10-13, #687); keeping the card open was declined. A close
  // over a picked range keeps Dates and its field.
  function dismiss(next: boolean) {
    if (!next && selection.kind === 'days' && !hasDates(selection)) {
      switchMode('now')
      return
    }
    setOpen(next)
  }

  // Hourly adds two rows and a month can hold five weeks or six, and either
  // changes the card's height while it is open; a card that grew without
  // being placed again would scroll in a gap the viewport could give it.
  const { popoverRef, box } = usePopover({
    open,
    onOpenChange: dismiss,
    triggerRef,
    remeasure: [hours !== undefined, weeks.length],
    initialFocusRef: focusedDayRef,
    anchorRef: slotRef,
    cover: true,
    ownPressRef: segmentRef,
  })

  // Escape and Tab hand the keyboard back while the card is still open, when
  // the field is not drawn yet and the Dates arm is all there is to take it.
  // Once the card has closed, the keyboard belongs on the field, or on Current
  // when the close with no day picked went back to it.
  const wasOpen = useRef(false)
  const kind = selection.kind
  useLayoutEffect(() => {
    if (wasOpen.current && !open && document.activeElement === datesRef.current) {
      ;(fieldRef.current ?? (kind === 'now' ? currentRef.current : null))?.focus()
    }
    wasOpen.current = open
  }, [open, kind])

  // The window in the words the results bar prints for an analyzed one
  // (`windowCaption`), so the field and the report it produces say the same
  // dates the same way. Empty until a day is picked: the Dates arm with no day
  // has no window, and the card opens on its own when the arm is chosen.
  const panelWindow = selectionLocalWindow(selection, now)
  let fieldText = ''
  if (selection.kind === 'days' && panelWindow) {
    const startMs = Date.parse(panelWindow.start)
    const endMs = Date.parse(panelWindow.end)
    fieldText = windowCaption('days', startMs, endMs, isPointSample(startMs, endMs), now)
  }

  // Opening pages to the selection, so a card closed on another month does not
  // reopen there with the chosen days out of sight.
  const openCalendar = useCallback(() => {
    if (hasDates(selection)) {
      setMonth(monthKey(selection.startDate))
      setFocused(selection.startDate)
    }
    setOpen(true)
  }, [selection])

  function setHours(next: { start: string; end: string } | undefined) {
    if (selection.kind !== 'days') return
    // Works on the dateless arm too: the hours refinement rides along and
    // applies once days are picked. The cast is safe — rest is the selection
    // minus `hours`, and both dated and dateless shapes admit that.
    const { hours: _dropped, ...rest } = selection
    onChange((next ? { ...rest, hours: next } : rest) as ForecastSelection)
  }

  const prevMonth = addMonths(month, -1)
  const nextMonth = addMonths(month, 1)

  // The arm switch sits OUTSIDE the card, and the card holds only what Dates
  // reveals. Two reasons, and the second is why it is worth the extra element.
  //
  // A control must not move when you operate it. With the switch inside,
  // choosing Dates drew a border around the thing under the cursor and inset it
  // by the well's padding, so the button you had just pressed shifted while you
  // were still looking at it.
  //
  // And a card around a lone segmented control is an empty card waiting for
  // something. Out here the row is what it looks like: one more
  // label-plus-control row, lining up with Model above it.
  const revealsGrid = selection.kind === 'days'

  return (
    <>
      {/* Both arms of the control, named, in the shape this panel already uses
          for a choice between two things — the same one the Hours row beneath it
          and the ranking direction toggle wear.

          Neither arm is an action, which is why neither is a button. A filled
          full-width bar here would carry the shape, weight and hue of Analyze
          further down the same panel, and only one of those two spends upstream
          quota; a secondary-button look would say the same thing more quietly.
          What is actually being expressed is which arm is live.

          The grid appears only under Dates, the way the hour fields appear only
          under Hourly. Each control reveals the next thing its answer makes
          relevant, and Current has no next thing: it takes no input at all, so
          a calendar under it would be 250px of card that does nothing. */}
      <div className="flex items-center justify-between gap-2">
        <span id={whenId} className={TEXT.subheading}>
          When
        </span>
        <div ref={segmentRef} className={SEGMENT}>
          {[
            {
              kind: 'now' as const,
              label: WHEN_ARM_LABEL.now,
              hint: 'Analyze conditions at the current hour',
            },
            // The word is `WHEN_ARM_LABEL`'s, which says why it is "Dates".
            { kind: 'days' as const, label: WHEN_ARM_LABEL.days, hint: 'Analyze a day or a range of days' },
          ].map((option, i) => (
            <button
              key={option.kind}
              ref={option.kind === 'days' ? datesRef : currentRef}
              aria-pressed={selection.kind === option.kind}
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

      {/* Hours, stacked directly under the arm switch rather than under the
          grid. Both rows are the same label-plus-segment shape, so the two
          decisions the window needs — which arm, and how much of a day — read
          as one block above the thing they qualify. Under the grid it sat six
          rows down, which put it below the fold on a laptop; a reviewer once
          got eight points into a review without finding it at all, back when it
          was a collapsed disclosure. */}
      {/* The field under the arm: full width, like the calendar it stands in
          for, because the window's words do not fit the control column (a
          two-day range is 26 characters) and record 0040 keeps the calendar
          as the one control with its own block. It is a SELECT for the same
          reason the model picker is: a recessed box with an arrow is what
          opens a choice in this panel, and the one control here that may
          stand two lines tall (CALENDAR_FIELD). Named by the When label and its own
          words together, so it is announced as the window it holds.

          It is drawn only when it has something to show (#687): with no range
          picked an empty box would stand above the card, and while the card is
          open the card stands in its place, top on its top, so the field is
          not drawn under it. The slot stays while the card is open, empty, as
          what the card is placed against. */}
      {revealsGrid && (fieldText !== '' || open) && (
        <div ref={slotRef} className="relative mt-2">
          {!open && (
            <>
              <button
                ref={fieldRef}
                type="button"
                aria-expanded={false}
                aria-labelledby={`${whenId} ${fieldTextId}`}
                onClick={openCalendar}
                className={CALENDAR_FIELD.box}
              >
                {/* Wraps rather than truncating: the longest window, hours and a
                    year, needs two lines at panel width, and the end of it is
                    what an ellipsis would hide. */}
                <span id={fieldTextId} className="min-w-0">
                  {fieldText}
                </span>
              </button>
              <IconSelectArrow placement={CALENDAR_FIELD.arrow} />
            </>
          )}
        </div>
      )}

      {revealsGrid && open && box && (
        <Popover box={box} popoverRef={popoverRef}>
          <div className={CALENDAR_GROUND}>
          <div className="flex items-center justify-between gap-2">
            <span className={TEXT.subheading} title={HOURS_NOTE}>
              Hours
            </span>
            <div className={SEGMENT} title={HOURS_NOTE}>
              {[
                { hourly: false, label: 'All day' },
                { hourly: true, label: 'Hourly' },
              ].map((option, i) => (
                <button
                  key={option.label}
                  aria-pressed={option.hourly === (hours !== undefined)}
                  aria-describedby={hoursNoteId}
                  onClick={() => setHours(option.hourly ? hours ?? defaultHours(now) : undefined)}
                  className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                    option.hourly === (hours !== undefined) ? ACCENT.fill : SEGMENT_IDLE
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {/* The note is the row's `title`, which reaches a pointer and
                nobody else, so it is mounted again as the hidden text both
                halves of the segment point at (#576). */}
            <span id={hoursNoteId} className={SR_ONLY}>
              {HOURS_NOTE}
            </span>
          </div>
          {/* Two label-plus-control rows, not a side-by-side pair: every other
              control in this panel sits beside its label at CONTROL_W, and the
              time fields lining up under the segments is what makes the well
              read as part of the same column. */}
          {hours && (
            <>
              <div className="mt-1.5 flex items-center gap-2">
                <label htmlFor="window-start-time" className={`${TEXT.control} flex-1`}>
                  Start
                </label>
                <input
                  id="window-start-time"
                  type="time"
                  value={hours.start}
                  onChange={(e) => {
                    if (!isTimeOfDay(e.target.value)) return
                    // On a single day, clamp the end time if start moves past it.
                    // This prevents overnight spans (18:00-06:00) from being entered
                    // on a single day, where they are invalid.
                    const isSingleDay =
                      selection.kind === 'days' && selection.startDate === selection.endDate
                    const newEnd =
                      isSingleDay && e.target.value >= hours.end
                        ? addOneHour(e.target.value)
                        : hours.end
                    setHours({ ...hours, start: e.target.value, end: newEnd })
                  }}
                  className={`${FIELD} ${CONTROL_W} px-2 py-1.5`}
                />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <label htmlFor="window-end-time" className={`${TEXT.control} flex-1`}>
                  End
                </label>
                <input
                  id="window-end-time"
                  type="time"
                  value={hours.end}
                  onChange={(e) => {
                    if (!isTimeOfDay(e.target.value)) return
                    // No clamp on the start, unlike the field above. A time
                    // typed digit by digit passes through the early hours on
                    // its way (the "1" of "10" is 01:00), which a start rarely
                    // crosses but an end nearly always does, so a clamp here
                    // moved the start to midnight on the first keystroke. An
                    // end left before its start is the 'order' warning's case.
                    setHours({ ...hours, end: e.target.value })
                  }}
                  className={`${FIELD} ${CONTROL_W} px-2 py-1.5`}
                />
              </div>
            </>
          )}

      {/* Month navigation, bounded by the servable band rather than open-ended:
          paging into a month with nothing pickable in it is a dead end. */}
      <div className={`mb-1 mt-2 flex items-center justify-between border-t ${SURFACE_DIVIDER} pt-2`}>
        <MonthButton
          label="Previous month"
          glyph="‹"
          disabled={!monthHasBandDay(prevMonth, now, band)}
          onClick={() => setMonth(prevMonth)}
        />
        <span className={TEXT.subheading}>{monthLabel(month)}</span>
        <MonthButton
          label="Next month"
          glyph="›"
          disabled={!monthHasBandDay(nextMonth, now, band)}
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
            <span key={i} role="columnheader" className={`${DAY.head} ${TEXT.micro}`}>
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
                buttonRef={cell.date === focused ? focusedDayRef : undefined}
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
          </div>
          {/* A way out that is a control, not only a press outside or Escape
              (the maintainer, 2026-10-13, #687). Outside the ground, so a
              card capped by a short window scrolls its days and keeps Done
              in view. Done keeps what is picked: over a range the card
              closes on Dates and its field, and with no day picked the arm
              goes back to Current, as every other close does (`dismiss`).
              The word and the button are draw mode's Done. */}
          <div className="flex justify-end p-2">
            <button type="button" onClick={() => dismiss(false)} className={BUTTON_ACCENT}>
              Done
            </button>
          </div>
        </Popover>
      )}
    </>
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
      className={`${BUTTON_SECONDARY} ${DISABLED}`}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )
}

function Day({
  cell,
  buttonRef,
  drawn,
  focused,
  onPress,
  onEnter,
  onActivate,
}: {
  cell: DayCell
  buttonRef?: Ref<HTMLButtonElement>
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
      ref={buttonRef}
      role="gridcell"
      data-day={cell.date}
      // aria-disabled rather than the disabled attribute: an unpickable day must
      // still be reachable by arrow key, or focus skips holes and the grid stops
      // being navigable at the band's edges.
      aria-disabled={inert || undefined}
      aria-selected={isEnd || inRange}
      aria-label={cell.date}
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
