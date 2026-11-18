import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import DayStrip from './DayStrip'
import { render } from '../testSupport/render'
import type { BandLimits, ForecastSelection } from '../utils/calendar/calendar'

// The day strip at a desk's map foot (record 0310): a press picks a day, a
// drag a run of them, Shift extends, and the arrows walk the days.
const NOW = () => new Date(2026, 6, 15, 12, 0)
const BAND: BandLimits = { forecastHours: 384, pastDays: 365, aqiDays: 5 }

function strip(selection: ForecastSelection = { kind: 'now' }, onSelection = vi.fn()) {
  render(<DayStrip selection={selection} onSelection={onSelection} band={BAND} transport={null} liftPx={0} now={NOW} />)
  return onSelection
}
const day = (key: string) => screen.getByRole('group', { name: 'Forecast day' }).querySelector<HTMLButtonElement>(`[data-day="${key}"]`)!

describe('DayStrip', () => {
  it('draws today first and the window’s days pressed', () => {
    strip({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-18' })
    const days = [...screen.getByRole('group', { name: 'Forecast day' }).querySelectorAll('button')]
    expect(days[0].dataset.day).toBe('2026-07-15')
    expect(days.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.day)).toEqual([
      '2026-07-17',
      '2026-07-18',
    ])
  })

  // The cell shows an initial and a number; a screen reader hears the day.
  it('names each day in full', () => {
    strip()
    expect(day('2026-07-17').textContent).toContain(new Date(2026, 6, 17).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }))
  })

  it('picks the day pressed, and a run of days dragged across', () => {
    const onSelection = strip()
    fireEvent.pointerDown(day('2026-07-17'), { button: 0 })
    fireEvent.pointerUp(window)
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-17' })
    fireEvent.pointerDown(day('2026-07-19'), { button: 0 })
    fireEvent.pointerEnter(day('2026-07-17'))
    fireEvent.pointerUp(window)
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-19' })
  })

  it('extends from the window’s first day on a Shift press, and picks on a key', () => {
    const onSelection = strip({ kind: 'days', startDate: '2026-07-16', endDate: '2026-07-16' })
    fireEvent.click(day('2026-07-19'), { shiftKey: true, detail: 1 })
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'days', startDate: '2026-07-16', endDate: '2026-07-19' })
    // A keyboard's press arrives as a click with no pointer behind it.
    fireEvent.click(day('2026-07-20'), { detail: 0 })
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'days', startDate: '2026-07-20', endDate: '2026-07-20' })
  })

  it('is one tab stop the arrows walk', () => {
    strip({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-17' })
    expect(day('2026-07-17').tabIndex).toBe(0)
    expect(day('2026-07-15').tabIndex).toBe(-1)
    day('2026-07-17').focus()
    fireEvent.keyDown(day('2026-07-17'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(day('2026-07-18'))
    expect(day('2026-07-18').tabIndex).toBe(0)
    fireEvent.keyDown(day('2026-07-18'), { key: 'Home' })
    expect(document.activeElement).toBe(day('2026-07-15'))
  })
})
