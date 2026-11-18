import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import SentenceBar from './SentenceBar'
import { panelMessages } from '../testSupport/fixtures'
import { render } from '../testSupport/render'

// The desk's sentence bar (record 0308): which card each chip opens, what the
// button says, and the run a link may ask for on open, which the bar now owns
// because its cards come and go.

type Props = ComponentProps<typeof SentenceBar>

function props(over: Partial<Props> = {}): Props {
  return {
    where: 'Peaks in this view',
    when: 'Sat 21 – Sun 22',
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
    fireEvent.click(screen.getByRole('button', { name: 'Peaks in this view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sat 21 – Sun 22' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limits' }))
    expect(onCard.mock.calls.map((c) => c[0])).toEqual(['destinations', 'forecast', 'metrics'])

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
})
