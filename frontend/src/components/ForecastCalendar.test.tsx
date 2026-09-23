import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ForecastCalendar from './ForecastCalendar'
import { DAY_END, type BandLimits, type ForecastSelection } from '../utils/calendar'
import { render } from '../testSupport/render'

// The calendar is wiring over the reducers in `utils/calendar.ts`, which carry
// their own suite. What is pinned here is the wiring: that a press, a drag and
// a toggle reach the right reducer and the answer reaches `onChange`.

// A fixed "now", 14:37 on a Tuesday, so the grid and the Hours default are the
// same on every run. Date alone is faked: user-event schedules its own timers.
const NOW = new Date(2026, 8, 15, 14, 37)

// Two days of forecast ahead and a month of archive behind, so both edges of
// the band fall inside September.
const BAND: BandLimits = { forecastHours: 48, pastDays: 30, aqiDays: 5 }

const onChange = vi.fn()

function Calendar({ initial }: { initial: ForecastSelection }) {
  const [selection, setSelection] = useState(initial)
  return (
    <ForecastCalendar
      selection={selection}
      onChange={(next) => {
        onChange(next)
        setSelection(next)
      }}
      band={BAND}
    />
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  onChange.mockClear()
})
afterEach(() => vi.useRealTimers())

const arm = (name: string) => screen.getByRole('button', { name })
const day = (date: string) => screen.getByRole('gridcell', { name: date })
const lastSelection = () => onChange.mock.lastCall?.[0] as ForecastSelection

describe('the two arms', () => {
  it('draws no grid under Current', () => {
    render(<Calendar initial={{ kind: 'now' }} />)
    expect(arm('Current').getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('opens the grid under Dates with no day chosen', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} />)
    await user.click(arm('Dates'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: null, endDate: null })
    expect(screen.getByRole('grid', { name: 'Forecast day' })).toBeTruthy()
    expect(day('2026-09-15').getAttribute('aria-selected')).toBe('false')
  })

  it('returns to the current hour from Dates', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15' }} />,
    )
    await user.click(arm('Current'))
    expect(lastSelection()).toEqual({ kind: 'now' })
  })

  it('brings the last range back when Dates is pressed again', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' }} />,
    )
    await user.click(arm('Current'))
    await user.click(arm('Dates'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' })
  })
})

describe('choosing days', () => {
  const dateless: ForecastSelection = { kind: 'days', startDate: null, endDate: null }

  it('takes a range from two taps', async () => {
    const { user } = render(<Calendar initial={dateless} />)
    await user.click(day('2026-09-10'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-10' })
    await user.click(day('2026-09-13'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-13' })
    expect(day('2026-09-11').getAttribute('aria-selected')).toBe('true')
  })

  it('takes a range from one drag, and the release does not count as a tap', () => {
    render(<Calendar initial={dateless} />)
    fireEvent.pointerDown(day('2026-09-10'))
    fireEvent.pointerEnter(day('2026-09-12'))
    // The drag is a preview until it is released: nothing reaches App yet.
    expect(onChange).not.toHaveBeenCalled()
    expect(day('2026-09-11').getAttribute('aria-selected')).toBe('true')
    fireEvent.pointerUp(window)
    // A browser ends a drag with a click on the day it was released over.
    fireEvent.click(day('2026-09-12'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' })
  })

  it('draws days past the band but will not take them', async () => {
    const { user } = render(<Calendar initial={dateless} />)
    const beyond = day('2026-09-25')
    expect(beyond.getAttribute('aria-disabled')).toBe('true')
    await user.click(beyond)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the Hours segment', () => {
  it('opens Hourly on this hour through the end of the day', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15' }} />,
    )
    expect(screen.getByRole('button', { name: 'All day' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'Hourly' }))
    expect(lastSelection()).toEqual({
      kind: 'days',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      hours: { start: '14:00', end: DAY_END },
    })
    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('14:00')
  })

  it('drops the hours on All day', async () => {
    const { user } = render(
      <Calendar
        initial={{
          kind: 'days',
          startDate: '2026-09-15',
          endDate: '2026-09-16',
          hours: { start: '06:00', end: '18:00' },
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'All day' }))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' })
    expect(screen.queryByLabelText('Start')).toBeNull()
  })

  it('pushes the end past a start moved beyond it on a single day', () => {
    render(
      <Calendar
        initial={{
          kind: 'days',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          hours: { start: '06:00', end: '10:00' },
        }}
      />,
    )
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '12:00' } })
    expect(lastSelection()).toMatchObject({ hours: { start: '12:00', end: '13:00' } })
  })
})
