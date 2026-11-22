import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import SentenceBar from './SentenceBar'
import { panelMessages } from '../testSupport/fixtures'
import { render } from '../testSupport/render'
import { BUTTON_FORECAST_QUIET } from '../styles'

// The desk's sentence bar (record 0309): which card each chip opens, what the
// button says, and the run a link may ask for on open, which the bar now owns
// because its cards come and go.

type Props = ComponentProps<typeof SentenceBar>

function props(over: Partial<Props> = {}): Props {
  return {
    what: 'Peaks',
    area: 'this view',
    when: 'Sat 21 – Sun 22',
    whenWord: 'on',
    card: null,
    onCard: () => {},
    label: 'Forecast 247 peaks',
    footer: {
      analyzeEnabled: true,
      word: 'Analyze',
      onAnalyze: () => {},
      onTutorial: () => {},
      messages: panelMessages(),
    },
    autoAnalyze: false,
    capabilitiesSettled: true,
    onAutoAnalyze: () => {},
    ...over,
  }
}

describe('SentenceBar', () => {
  it('leads with the product name as the page heading', () => {
    render(<SentenceBar {...props()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Bluebird Forecast' })).toBeTruthy()
  })

  it('opens the card each chip stands for, and a second press shuts it', () => {
    const onCard = vi.fn()
    const { rerender } = render(<SentenceBar {...props({ onCard })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Peaks' }))
    fireEvent.click(screen.getByRole('button', { name: 'this view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sat 21 – Sun 22' }))
    expect(onCard.mock.calls.map((c) => c[0])).toEqual(['destinations', 'destinations', 'forecast'])
    // The limits stand with the results now (record 0319).
    expect(screen.queryByRole('button', { name: 'Limits' })).toBeNull()

    onCard.mockClear()
    rerender(<SentenceBar {...props({ onCard, card: 'forecast' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sat 21 – Sun 22' }))
    expect(onCard).toHaveBeenCalledWith(null)
  })

  it('names the spend on the button, and the run word over it while one is up or failed', () => {
    const onAnalyze = vi.fn()
    const { rerender } = render(<SentenceBar {...props({ footer: { ...props().footer, onAnalyze } })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Forecast 247 peaks' }))
    expect(onAnalyze).toHaveBeenCalledTimes(1)
    rerender(<SentenceBar {...props({ footer: { ...props().footer, word: 'Try again' } })} />)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  // The sentence reads `Peaks in this view on Sat 21 – Sun 22` (record
  // 0314): a list drops the place, Current drops the `on`.
  it('joins the phrases with in and on, and leaves out what a list or Current lacks', () => {
    const { container, rerender } = render(<SentenceBar {...props()} />)
    const group = () => screen.getByRole('group', { name: 'Forecast' }).textContent
    expect(group()).toContain('Peaksinthis viewonSat 21 – Sun 22')
    rerender(<SentenceBar {...props({ what: 'Your list', area: null, when: 'Current', whenWord: null })} />)
    expect(group()).toContain('Your listCurrent')
    expect(container.textContent).not.toMatch(/\bin\b|\bon\b/)
  })

  // The one warm fill means a forecast will be spent: with nothing new to
  // fetch the button is an outline that still takes a press.
  it('draws Up to date as an outline that still runs', () => {
    const onAnalyze = vi.fn()
    render(<SentenceBar {...props({ label: 'Up to date', footer: { ...props().footer, onAnalyze } })} />)
    const button = screen.getByRole('button', { name: 'Up to date' })
    expect(button.className).toContain(BUTTON_FORECAST_QUIET)
    fireEvent.click(button)
    expect(onAnalyze).toHaveBeenCalledTimes(1)
  })

  it('runs a link’s analyze once the gate opens, and only once', () => {
    const onAutoAnalyze = vi.fn()
    const closed = { ...props().footer, analyzeEnabled: false }
    const { rerender } = render(<SentenceBar {...props({ autoAnalyze: true, onAutoAnalyze, footer: closed })} />)
    rerender(<SentenceBar {...props({ autoAnalyze: true, onAutoAnalyze })} />)
    rerender(<SentenceBar {...props({ autoAnalyze: true, onAutoAnalyze, label: 'Forecast 3 peaks' })} />)
    expect(onAutoAnalyze).toHaveBeenCalledTimes(1)
  })

  it('stands what it is handed after the button', () => {
    render(<SentenceBar {...props({ trail: <button>Theme</button> })} />)
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons[buttons.length - 1]).toBe('Theme')
  })

  // A phone's bar (record 0328): the logo and the phrases on one line, each
  // raising the Controls sheet, with no button and no run of its own, since
  // the map's button spends and the sheet runs a link's one Forecast.
  it('on a phone carries the phrases alone, and leaves a link\'s run to the sheet', () => {
    const onCard = vi.fn()
    const onAutoAnalyze = vi.fn()
    render(<SentenceBar {...props({ phone: true, onCard, autoAnalyze: true, onAutoAnalyze })} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Bluebird Forecast' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Forecast 247 peaks' })).toBeNull()
    expect(screen.queryByText('Bluebird Forecast', { selector: 'h1:not(.sr-only)' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sat 21 – Sun 22' }))
    fireEvent.click(screen.getByRole('button', { name: 'Peaks' }))
    expect(onCard.mock.calls.map((c) => c[0])).toEqual(['forecast', 'destinations'])
    expect(onAutoAnalyze).not.toHaveBeenCalled()
  })
})
