import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import ForecastCalendar from './ForecastCalendar'
import { DAY_END, type BandLimits, type ForecastSelection } from '../utils/calendar/calendar'
import { render } from '../testSupport/render'

// The calendar is wiring over the reducers in `utils/calendar/calendar.ts`, which carry
// their own suite. What is pinned here is the wiring: that a press, a drag and
// a toggle reach the right reducer and the answer reaches `onChange`.

// A fixed "now", 14:37 on a Tuesday, so the grid and the Hours default are the
// same on every run. Date alone is faked: user-event schedules its own timers.
const NOW = new Date(2026, 8, 15, 14, 37)

// Two days of forecast ahead and a month of archive behind, so both edges of
// the band fall inside September.
const BAND: BandLimits = { forecastHours: 48, pastDays: 30, aqiDays: 5 }

const onChange = vi.fn()

function Calendar({ initial, sheet = false }: { initial: ForecastSelection; sheet?: boolean }) {
  const [selection, setSelection] = useState(initial)
  return (
    <ForecastCalendar
      selection={selection}
      onChange={(next) => {
        onChange(next)
        setSelection(next)
      }}
      band={BAND}
      sheet={sheet}
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
// The field under Dates, named by the When label and the window it holds.
const field = () => screen.getByRole('button', { name: /^When\b/ })
const noField = () => screen.queryByRole('button', { name: /^When\b/ })
// The Hours row and the grid live in the card the field opens (#687). With no
// range there is no field, and Dates opens the card.
const openCalendar = (user: { click: (el: Element) => Promise<void> }) => user.click(noField() ?? arm('Dates'))

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
    await openCalendar(user)
    await user.click(day('2026-09-10'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-10' })
    await user.click(day('2026-09-13'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-13' })
    expect(day('2026-09-11').getAttribute('aria-selected')).toBe('true')
  })

  it('takes a range from one drag, and the release does not count as a tap', async () => {
    const { user } = render(<Calendar initial={dateless} />)
    await openCalendar(user)
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
    await openCalendar(user)
    const beyond = day('2026-09-25')
    expect(beyond.getAttribute('aria-disabled')).toBe('true')
    await user.click(beyond)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('the Hours segment', () => {
  // The note was the row's title alone, which reaches a pointer and nobody
  // else (#576). Both halves of the segment now carry it as a description.
  it('describes both halves with the note the row shows on hover', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15' }} />,
    )
    await openCalendar(user)
    const note = screen.getByRole('button', { name: 'Hourly' }).closest('[title]')!.getAttribute('title')!
    for (const name of ['All day', 'Hourly']) {
      expect(screen.getByRole('button', { name, description: note })).toBeTruthy()
    }
  })

  it('opens Hourly on this hour through the end of the day', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15' }} />,
    )
    await openCalendar(user)
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
    await openCalendar(user)
    await user.click(screen.getByRole('button', { name: 'All day' }))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' })
    expect(screen.queryByLabelText('Start')).toBeNull()
  })

  it('pushes the end past a start moved beyond it on a single day', async () => {
    const { user } = render(
      <Calendar
        initial={{
          kind: 'days',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          hours: { start: '06:00', end: '10:00' },
        }}
      />,
    )
    await openCalendar(user)
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '12:00' } })
    expect(lastSelection()).toMatchObject({ hours: { start: '12:00', end: '13:00' } })
  })

  // An end typed one digit at a time passes 01:00 on its way to 10:00, and the
  // start must still be where the reader left it when the second digit lands.
  it('leaves the start alone while the end is typed through earlier hours', async () => {
    const { user } = render(
      <Calendar
        initial={{
          kind: 'days',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          hours: { start: '06:00', end: '18:00' },
        }}
      />,
    )
    await openCalendar(user)
    const end = screen.getByLabelText('End')
    fireEvent.change(end, { target: { value: '01:00' } })
    fireEvent.change(end, { target: { value: '10:00' } })
    expect(lastSelection()).toMatchObject({ hours: { start: '06:00', end: '10:00' } })
  })
})

describe('the date field', () => {
  // The field says the window in the results bar's own words (windowCaption),
  // so a picked range reads the same before and after it is analyzed.
  it('holds the selected window in the results bar\'s words', () => {
    render(<Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' }} />)
    expect(field().textContent).toBe('Tue, Sep 15 to Wed, Sep 16')
    expect(field().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('names hours when the window is narrowed to them', () => {
    render(
      <Calendar
        initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15', hours: { start: '06:00', end: '18:00' } }}
      />,
    )
    expect(field().textContent).toBe('Tue, Sep 15, 6:00 AM to 6:00 PM')
  })

  // The longest window, hours across two days in another year, is shown
  // whole on two lines rather than cut off with an ellipsis (#687).
  it('shows the longest window whole, wrapping rather than truncating', () => {
    render(
      <Calendar
        initial={{
          kind: 'days',
          startDate: '2025-10-14',
          endDate: '2025-10-15',
          hours: { start: '10:00', end: '23:59' },
        }}
      />,
    )
    const words = field().querySelector('span')!
    expect(words.textContent).toBe('Tue, Oct 14 2025, 10:00 AM to Wed, Oct 15 2025, 11:59 PM')
    expect(words.className).not.toMatch(/truncate/)
    expect(field().className).not.toMatch(/truncate|whitespace-nowrap/)
  })

  it('is not drawn under Current', () => {
    render(<Calendar initial={{ kind: 'now' }} />)
    expect(screen.queryByRole('button', { name: /^When\b/ })).toBeNull()
  })

  // The card stands 4px under the field like every menu (record 0201), the
  // field lit while it is out and back to rest when it closes.
  it('opens the card on the selected day under the field', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' }} />,
    )
    await user.click(field())
    expect(field().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('grid', { name: 'Forecast day' })).toBeTruthy()
    // The keyboard lands on the dates, not on the Hours row above them.
    expect(document.activeElement).toBe(day('2026-09-15'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(field().getAttribute('aria-expanded')).toBe('false')
    expect(field().textContent).toBe('Tue, Sep 15 to Wed, Sep 16')
  })

  // A second press on the field closes the card, as on every trigger.
  it('closes the card from its field', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' }} />,
    )
    await user.click(field())
    await user.click(field())
    expect(screen.queryByRole('grid')).toBeNull()
  })

  // With no range there is nothing for a field to hold, so none is drawn,
  // and Dates opens the card where the field would stand (#687).
  it('draws no empty field under Dates with no range', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} />)
    await user.click(arm('Dates'))
    expect(noField()).toBeNull()
    expect(screen.getByRole('grid')).toBeTruthy()
  })

  // Closing the card with no day picked leaves Dates nothing to hold, so the
  // arm goes back to Current, by Escape and by a press outside alike (#687).
  it('goes back to Current when the card closes with no day picked', async () => {
    const { user } = render(
      <>
        <Calendar initial={{ kind: 'now' }} />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.click(arm('Dates'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(lastSelection()).toEqual({ kind: 'now' })
    expect(arm('Current').getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(arm('Current'))
    expect(noField()).toBeNull()

    await user.click(arm('Dates'))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(lastSelection()).toEqual({ kind: 'now' })
    expect(arm('Current').getAttribute('aria-pressed')).toBe('true')
  })

  // A close over a picked range keeps the arm and shows the field.
  it('keeps Dates and the field when the card closes over a range', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' }} />,
    )
    await user.click(field())
    await user.keyboard('{Escape}')
    expect(arm('Dates').getAttribute('aria-pressed')).toBe('true')
    expect(field().textContent).toBe('Tue, Sep 15 to Wed, Sep 16')
    expect(onChange).not.toHaveBeenCalled()
  })

  // Done closes the card and keeps what is picked: over a range the arm stays
  // on Dates and the field takes the keyboard (#687).
  it('closes on Done over a range, keeping Dates and handing the field the keyboard', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} />)
    await user.click(arm('Dates'))
    await user.click(day('2026-09-10'))
    await user.click(day('2026-09-12'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(arm('Dates').getAttribute('aria-pressed')).toBe('true')
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' })
    expect(document.activeElement).toBe(field())
  })

  // With no day picked, Done is a close like any other: back to Current.
  it('goes back to Current on Done with no day picked', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} />)
    await user.click(arm('Dates'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(lastSelection()).toEqual({ kind: 'now' })
    expect(document.activeElement).toBe(arm('Current'))
    expect(noField()).toBeNull()
  })

  // A link can carry Dates with no day. There is no field to press, so Dates
  // pressed again is the way into the card.
  it('opens the card from Dates when a link brings Dates with no day', async () => {
    const { user } = render(<Calendar initial={{ kind: 'days', startDate: null, endDate: null }} />)
    expect(noField()).toBeNull()
    expect(screen.queryByRole('grid')).toBeNull()
    await user.click(arm('Dates'))
    expect(screen.getByRole('grid')).toBeTruthy()
  })

  // Current closes the card and drops the field in one render. The press
  // used to close the card on pointerdown and change the arm on the click, a
  // moment later, so the card left before the rest (#687).
  it('closes the card and the field together when Current is pressed', () => {
    render(<Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-16' }} />)
    fireEvent.click(field())
    expect(screen.getByRole('grid')).toBeTruthy()
    fireEvent.pointerDown(arm('Current'))
    expect(screen.getByRole('grid')).toBeTruthy()
    fireEvent.click(arm('Current'))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.queryByRole('button', { name: 'All day' })).toBeNull()
    expect(noField()).toBeNull()
  })

  it('stays open while a range is picked, and a press outside closes it', async () => {
    const { user } = render(
      <>
        <Calendar initial={{ kind: 'days', startDate: null, endDate: null }} />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.click(arm('Dates'))
    await user.click(day('2026-09-10'))
    await user.click(day('2026-09-12'))
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' })
    expect(screen.getByRole('grid')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(field().textContent).toBe('Thu, Sep 10 to Sat, Sep 12')
  })

  it('picks by keyboard, and Escape closes the card and hands the field back', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-15', endDate: '2026-09-15' }} />,
    )
    field().focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(day('2026-09-15'))
    await user.keyboard('{ArrowLeft}{Enter}')
    expect(lastSelection()).toEqual({ kind: 'days', startDate: '2026-09-14', endDate: '2026-09-14' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('grid')).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('closes the card when the arm goes back to Current', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} />)
    await user.click(arm('Dates'))
    expect(screen.getByRole('grid')).toBeTruthy()
    await user.click(arm('Current'))
    expect(screen.queryByRole('grid')).toBeNull()
  })

  // Dates with a range to bring back opens nothing: the field says it.
  it('leaves the card shut when Dates restores a range', async () => {
    const { user } = render(
      <Calendar initial={{ kind: 'days', startDate: '2026-09-10', endDate: '2026-09-12' }} />,
    )
    await user.click(arm('Current'))
    await user.click(arm('Dates'))
    expect(screen.queryByRole('grid')).toBeNull()
    expect(field().textContent).toBe('Thu, Sep 10 to Sat, Sep 12')
  })
})

// A phone's calendar is a bottom sheet headed by the When label's word
// (record 0136): the Hours row and the grid in it, the sheet's Done in place
// of the card's own, and every close the card's (`dismiss`).
describe('on a phone', () => {
  it('opens a sheet headed When from Dates, with one Done', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} sheet />)
    await user.click(arm('Dates'))
    const sheet = screen.getByRole('dialog', { name: 'When' })
    expect(sheet.querySelector('[role="grid"]')).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1)
    expect(document.querySelector('body > [data-side]')).toBeNull()
  })

  it('goes back to Current on Done with no day picked', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} sheet />)
    await user.click(arm('Dates'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(lastSelection()).toEqual({ kind: 'now' })
  })

  it('keeps a picked range and its field on Done', async () => {
    const { user } = render(<Calendar initial={{ kind: 'now' }} sheet />)
    await user.click(arm('Dates'))
    await user.click(day('2026-09-16'))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(arm('Dates').getAttribute('aria-pressed')).toBe('true')
    expect(field()).toBeTruthy()
    await user.click(field())
    expect(screen.getByRole('dialog', { name: 'When' })).toBeTruthy()
  })
})
