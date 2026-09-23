import { describe, expect, it } from 'vitest'
import { AQI_LIMIT_DAYS, type BandLimits, bandStart } from './calendarBand'
import {
  DEFAULT_SELECTION,
  DaysSelection,
  ForecastSelection,
  applyDayClick,
  applyDayDrag,
  applyModeSwitch,
  clampSelection,
  hasDates,
  dragAnchor,
  selectionLocalWindow,
} from './calendarSelection'

// Local noon on a Wednesday in July, well inside the servable band. Every
// horizon assertion below is measured from here.
const NOW = new Date(2026, 6, 15, 12, 0)

// A reach long enough that the API's hard date edge binds before any model's
// does, so these assertions test the edge they mean to. 384 h is what GFS
// measured; ECMWF's floor is 336. HRRR's 42 is the interesting opposite, and
// calendarBand.test.ts gives it a block of its own.
//
// The near edge and the air-quality horizon ride in the same object (#123,
// #393). Both are what `/api/capabilities` publishes rather than measured API
// edges, and the fallbacks the hook compiles are the values used here.
const ARCHIVE_DAYS = 365
const LONG: BandLimits = {
  forecastHours: 384,
  pastDays: ARCHIVE_DAYS,
  aqiDays: AQI_LIMIT_DAYS,
}

const HRRR: BandLimits = { ...LONG, forecastHours: 42 }

// The two 2026 transitions in the timezone vitest.config.ts pins. A local
// calendar day is 23 hours on the first and 25 on the second, which is the whole
// reason day arithmetic here goes through the Date constructor rather than
// adding 86,400,000 ms.
const SPRING_FORWARD = '2026-03-08'

const FALL_BACK = '2026-11-01'

const HOUR = 3_600_000

const MINUTE = 60_000

describe('clampSelection', () => {
  const days = (startDate: string, endDate: string): ForecastSelection => ({
    kind: 'days',
    startDate,
    endDate,
  })

  it('leaves a selection that still fits alone', () => {
    expect(clampSelection(days('2026-07-15', '2026-07-16'), NOW, HRRR)).toBeNull()
  })

  // Null rather than an equal value is what lets the caller warn only when
  // something moved; an equality check on the result would fire every time.
  it('reports no change as null rather than as a copy', () => {
    const sel = days('2026-07-15', '2026-07-16')
    expect(clampSelection(sel, NOW, LONG)).toBeNull()
  })

  it('trims an end that the new model no longer reaches', () => {
    expect(clampSelection(days('2026-07-15', '2026-07-28'), NOW, HRRR)).toEqual(
      days('2026-07-15', '2026-07-17'),
    )
  })

  // Both ends clamp independently, which is what settles a range sitting
  // wholly past the new edge: it collapses onto the last day still available
  // rather than onto nothing.
  it('collapses a range that is entirely beyond the new edge', () => {
    expect(clampSelection(days('2026-07-25', '2026-07-28'), NOW, HRRR)).toEqual(
      days('2026-07-17', '2026-07-17'),
    )
  })

  it('pulls a start from before the history limit back to it', () => {
    const clamped = clampSelection(days('2024-01-01', '2026-07-16'), NOW, LONG)
    expect(clamped?.kind === 'days' && clamped.startDate).toBe(bandStart(NOW, LONG))
  })

  // Narrowed hours describe the span, not the days it covers, so a clamp that
  // moved the days keeps them rather than reopening the disclosure closed.
  it('carries narrowed hours across the clamp', () => {
    const sel: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-28',
      hours: { start: '06:00', end: '18:00' },
    }
    const clamped = clampSelection(sel, NOW, HRRR)
    expect(clamped?.kind === 'days' && clamped.hours).toEqual({ start: '06:00', end: '18:00' })
  })

  // The current hour is the one selection every model reaches.
  it('never clamps the current-hour selection', () => {
    expect(clampSelection(DEFAULT_SELECTION, NOW, HRRR)).toBeNull()
  })
})

describe('applyModeSwitch', () => {
  const days = (startDate: string, endDate: string): DaysSelection => ({
    kind: 'days',
    startDate,
    endDate,
  })

  it('leaves the arm already live untouched', () => {
    const sel = days('2026-07-15', '2026-07-16')
    expect(applyModeSwitch('days', sel, null, NOW, LONG)).toBe(sel)
    expect(applyModeSwitch('now', DEFAULT_SELECTION, null, NOW, LONG)).toBe(
      DEFAULT_SELECTION,
    )
  })

  it('switches to the current hour from any range', () => {
    expect(
      applyModeSwitch('now', days('2026-07-15', '2026-07-16'), null, NOW, LONG),
    ).toEqual({ kind: 'now' })
  })

  // The round trip Days → Now → Days is a comparison people make, and losing
  // the range to it was the whole cost of making it.
  it('restores the range the user last had', () => {
    const remembered = days('2026-07-20', '2026-07-23')
    expect(applyModeSwitch('days', DEFAULT_SELECTION, remembered, NOW, LONG)).toEqual(
      remembered,
    )
  })

  it('carries narrowed hours back with the range', () => {
    const remembered: DaysSelection = {
      kind: 'days',
      startDate: '2026-07-20',
      endDate: '2026-07-23',
      hours: { start: '06:00', end: '18:00' },
    }
    const next = applyModeSwitch('days', DEFAULT_SELECTION, remembered, NOW, LONG)
    expect(next.kind === 'days' && next.hours).toEqual({ start: '06:00', end: '18:00' })
  })

  // No pre-selected today: opening Dates paints nothing as chosen, because
  // "today" is what Current already provides (#242 review). Analyze blocks on
  // this state through the dates blocker.
  it('opens the Dates arm empty when there is no range to restore', () => {
    expect(applyModeSwitch('days', DEFAULT_SELECTION, null, NOW, LONG)).toEqual({
      kind: 'days',
      startDate: null,
      endDate: null,
    })
  })

  it('treats the empty Dates arm as unclampable and windowless', () => {
    const pending = { kind: 'days', startDate: null, endDate: null } as const
    expect(clampSelection(pending, NOW, LONG)).toBeNull()
    expect(selectionLocalWindow(pending, NOW)).toBeNull()
    expect(hasDates(pending)).toBe(false)
  })

  it('selects a single day from the empty Dates arm with one click', () => {
    const pending = { kind: 'days', startDate: null, endDate: null } as const
    const first = applyDayClick(pending, null, '2026-07-18')
    expect(first.selection).toEqual(days('2026-07-18', '2026-07-18'))
    expect(first.anchor).toBe('2026-07-18')
    const second = applyDayClick(first.selection, first.anchor, '2026-07-20')
    expect(second.selection).toEqual(days('2026-07-18', '2026-07-20'))
    expect(second.anchor).toBeNull()
  })

  // The model can change while Now is the live arm, so the remembered range
  // may name days the band no longer covers. Restoring it unclamped would put
  // the selection where the grid draws unpickable cells.
  it('clamps a restored range into a band that moved under it', () => {
    expect(
      applyModeSwitch('days', DEFAULT_SELECTION, days('2026-07-20', '2026-07-28'), NOW, HRRR),
    ).toEqual(days('2026-07-17', '2026-07-17'))
  })
})

describe('picking days', () => {
  const single: ForecastSelection = { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' }
  const range: ForecastSelection = { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-19' }

  it('selects one whole day on a first click, and leaves it anchored', () => {
    const { selection, anchor } = applyDayClick(DEFAULT_SELECTION, null, '2026-07-15')
    expect(selection).toEqual(single)
    expect(anchor).toBe('2026-07-15')
  })

  it('extends to a range on the next click, spending the anchor', () => {
    const { selection, anchor } = applyDayClick(single, '2026-07-15', '2026-07-19')
    expect(selection).toEqual(range)
    expect(anchor).toBeNull()
  })

  it('orders the range however the two clicks came in', () => {
    expect(applyDayClick(single, '2026-07-19', '2026-07-15').selection).toEqual(range)
  })

  // The alternative was making the user clear first, which the maintainer called
  // out as the thing to avoid.
  it('restarts at the day clicked inside an existing range', () => {
    const { selection, anchor } = applyDayClick(range, null, '2026-07-17')
    expect(selection).toEqual({
      kind: 'days',
      startDate: '2026-07-17',
      endDate: '2026-07-17',
    })
    expect(anchor).toBe('2026-07-17')
  })

  it('re-clicking the anchored day keeps it a single day', () => {
    const { selection, anchor } = applyDayClick(single, '2026-07-15', '2026-07-15')
    expect(selection).toEqual(single)
    expect(anchor).toBe('2026-07-15')
  })

  it('keeps the narrowed hours across a change of days', () => {
    const narrowed: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-15',
      hours: { start: '06:00', end: '18:00' },
    }
    expect(applyDayClick(narrowed, null, '2026-07-20').selection).toEqual({
      kind: 'days',
      startDate: '2026-07-20',
      endDate: '2026-07-20',
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('leaves no hours behind when coming from the current-hour selection', () => {
    expect(applyDayClick({ kind: 'now' }, null, '2026-07-15').selection).toEqual(single)
  })

  it('commits a drag as an ordered range', () => {
    expect(applyDayDrag(single, '2026-07-19', '2026-07-15')).toEqual(range)
    expect(applyDayDrag(single, '2026-07-15', '2026-07-19')).toEqual(range)
  })

  // Grabbing an end pivots on the other one, which is what makes dragging an end
  // adjust that end instead of starting a new selection.
  it('pivots a drag on the opposite end of an existing range', () => {
    expect(dragAnchor(range, '2026-07-15')).toBe('2026-07-19')
    expect(dragAnchor(range, '2026-07-19')).toBe('2026-07-15')
  })

  it('pivots on the pressed day everywhere else', () => {
    expect(dragAnchor(range, '2026-07-17')).toBe('2026-07-17')
    expect(dragAnchor(single, '2026-07-15')).toBe('2026-07-15')
    expect(dragAnchor({ kind: 'now' }, '2026-07-15')).toBe('2026-07-15')
  })

  // An overnight span (18:00 to 06:00) is valid on a multi-day range but
  // impossible on a single day. When a range with overnight hours collapses
  // to one day, the reversed hours should be dropped entirely.
  it('drops reversed hours when a range with overnight hours collapses to one day', () => {
    const rangeWithOvernight: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-19',
      hours: { start: '18:00', end: '06:00' },
    }
    const result = applyDayClick(rangeWithOvernight, null, '2026-07-17')
    expect(result.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-17',
      endDate: '2026-07-17',
      // hours dropped because 06:00 <= 18:00 on a single day
    })
  })

  it('keeps forward hours when a range collapses to one day', () => {
    const rangeWithForward: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-19',
      hours: { start: '06:00', end: '18:00' },
    }
    const result = applyDayClick(rangeWithForward, null, '2026-07-17')
    expect(result.selection).toEqual({
      kind: 'days',
      startDate: '2026-07-17',
      endDate: '2026-07-17',
      hours: { start: '06:00', end: '18:00' },
    })
  })

  it('keeps overnight hours across a multi-day drag', () => {
    const rangeWithOvernight: ForecastSelection = {
      kind: 'days',
      startDate: '2026-07-15',
      endDate: '2026-07-19',
      hours: { start: '18:00', end: '06:00' },
    }
    expect(applyDayDrag(rangeWithOvernight, '2026-07-16', '2026-07-25')).toEqual({
      kind: 'days',
      startDate: '2026-07-16',
      endDate: '2026-07-25',
      hours: { start: '18:00', end: '06:00' },
    })
  })
})

describe('selectionLocalWindow', () => {
  it('reports the current hour as the same moment twice', () => {
    const { start, end } = selectionLocalWindow({ kind: 'now' }, NOW)!
    expect(start).toBe('2026-07-15T12:00')
    expect(end).toBe(start)
  })

  it('spans a whole day from midnight to the last minute', () => {
    expect(
      selectionLocalWindow(
        { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T00:00', end: '2026-07-15T23:59' })
  })

  it('spans a range from the first day to the last', () => {
    expect(
      selectionLocalWindow(
        { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-19' },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T00:00', end: '2026-07-19T23:59' })
  })

  it('uses the narrowed hours on both ends when they are set', () => {
    expect(
      selectionLocalWindow(
        {
          kind: 'days',
          startDate: '2026-07-15',
          endDate: '2026-07-19',
          hours: { start: '06:00', end: '18:00' },
        },
        NOW,
      ),
    ).toEqual({ start: '2026-07-15T06:00', end: '2026-07-19T18:00' })
  })

  // 23:59 rather than the next midnight is what keeps a whole day 24 hourly
  // stamps under the backend's inclusive filter, and it is also what makes the
  // span below fall one minute short of a round day.
  it('measures a plain day as very nearly 24 hours', () => {
    const { start, end } = selectionLocalWindow(
      { kind: 'days', startDate: '2026-07-15', endDate: '2026-07-15' },
      NOW,
    )!
    expect(Date.parse(end) - Date.parse(start)).toBe(24 * HOUR - MINUTE)
  })

  it('measures a spring-forward day as 23 hours and a fall-back day as 25', () => {
    const span = (date: string) => {
      const { start, end } = selectionLocalWindow(
        { kind: 'days', startDate: date, endDate: date },
        NOW,
      )!
      return Date.parse(end) - Date.parse(start)
    }
    expect(span(SPRING_FORWARD)).toBe(23 * HOUR - MINUTE)
    expect(span(FALL_BACK)).toBe(25 * HOUR - MINUTE)
  })
})

describe('the default selection', () => {
  // #161 made the no-input answer the landing state on purpose: the first
  // question most people arrive with needs no dates to ask.
  it('is the current hour, so a fresh load can Analyze with no input', () => {
    expect(DEFAULT_SELECTION).toEqual({ kind: 'now' })
  })
})
