import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import DayStrip, { type StripZoom } from './DayStrip'
import { placeAt, render } from '../testSupport/render'
import { DAY, DAY_STRIP } from '../styles'
import type { BandLimits, ForecastSelection } from '../utils/calendar/calendar'

// The day strip at a desk's map foot (record 0311): a press picks a day, a
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

  // A finger's pointer stays with the day it pressed, so no other day hears
  // it enter: the strip reads the day under it from its x (record 0336). The
  // days stand 20px wide from the row's left edge here.
  it('picks a run of days a finger drags across, and nothing when the browser cancels', () => {
    const onSelection = strip()
    const buttons = [...screen.getByRole('group', { name: 'Forecast day' }).querySelectorAll<HTMLElement>('[data-day]')]
    buttons.forEach((b, i) => placeAt(b, { left: i * 20, top: 0, width: 20, height: 40 }))
    fireEvent.pointerDown(day('2026-07-17'), { button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(window, { clientX: 3 * 20 + 10, pointerType: 'touch' })
    fireEvent.pointerMove(window, { clientX: 5 * 20 + 10, pointerType: 'touch' })
    fireEvent.pointerUp(window)
    expect(onSelection).toHaveBeenLastCalledWith({ kind: 'days', startDate: '2026-07-17', endDate: '2026-07-20' })
    onSelection.mockClear()
    fireEvent.pointerDown(day('2026-07-17'), { button: 0, pointerType: 'touch' })
    fireEvent.pointerMove(window, { clientX: 4 * 20 + 10, pointerType: 'touch' })
    fireEvent.pointerCancel(window)
    fireEvent.pointerUp(window)
    expect(onSelection).not.toHaveBeenCalled()
  })

  // The browser's pan would cancel the press part way.
  it('keeps a finger on the row from panning the page', () => {
    expect(DAY_STRIP.row.split(' ')).toContain('touch-none')
    expect(DAY_STRIP.rowBare.split(' ')).toContain('touch-none')
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

  // After a forecast (record 0323): each day's sky, the window widened, a
  // playhead the window's days scrub, and the meta row in the player's place.
  describe('after a forecast', () => {
    const sel: ForecastSelection = { kind: 'days', startDate: '2026-07-17', endDate: '2026-07-17' }
    const times = Array.from({ length: 24 }, (_, h) => new Date(2026, 6, 17, h).getTime())
    function zoomed(over: Partial<StripZoom> = {}) {
      const zoom: StripZoom = {
        sky: new Map([['2026-07-17', [10, 20, 30, 40, 50, 60, 70, 80]]]),
        range: { lo: 0, hi: 100 },
        times,
        index: 12,
        onIndex: vi.fn(),
        playing: false,
        onPlaying: vi.fn(),
        readout: 'Fri 12 PM',
        label: 'Score time',
        model: 'GFS',
        onModel: vi.fn(),
        ...over,
      }
      render(
        <DayStrip selection={sel} onSelection={vi.fn()} band={BAND} transport={<div data-testid="transport" />} liftPx={0} now={NOW} zoom={zoom} />,
      )
      return zoom
    }

    it('paints the window\'s sky, widens its day and sets the playhead and its hour on it', () => {
      zoomed()
      const sky = day('2026-07-17').querySelector<HTMLElement>('[data-sky]')!
      expect([...sky.children].filter((c) => (c as HTMLElement).style.backgroundColor !== '')).toHaveLength(8)
      expect(Number(day('2026-07-17').style.flexGrow)).toBeGreaterThan(1)
      expect(day('2026-07-16').style.flexGrow).toBe('')
      expect(sky.textContent).toBe('12p')
      // The window's days wear the range's tint, not the accent (record 0326).
      expect(day('2026-07-17').className).toContain(DAY.range)
      expect(day('2026-07-17').className).not.toContain(DAY.selected)
    })

    it('draws the meta row in the player\'s place: play, the hour and the model', () => {
      const zoom = zoomed()
      expect(screen.queryByTestId('transport')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Play the timeline' }))
      expect(zoom.onPlaying).toHaveBeenCalledWith(true)
      fireEvent.change(screen.getByRole('slider', { name: 'Score time' }), { target: { value: '15' } })
      expect(zoom.onIndex).toHaveBeenCalledWith(15)
      fireEvent.click(screen.getByRole('button', { name: 'GFS' }))
      expect(zoom.onModel).toHaveBeenCalledTimes(1)
    })

    it('scrubs on a press in the window, and picks days outside it', () => {
      const zoom = zoomed()
      fireEvent.pointerDown(day('2026-07-17'), { button: 0, clientX: 0 })
      expect(zoom.onPlaying).toHaveBeenCalledWith(false)
      expect(zoom.onIndex).toHaveBeenCalled()
    })
  })
})

