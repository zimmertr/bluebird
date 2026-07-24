import { describe, it, expect } from 'vitest'
import { analyzeOverlay, PIN_REFRESH_MESSAGE } from './analyzeOverlay'

describe('analyzeOverlay', () => {
  it('is hidden when nothing is in flight', () => {
    expect(analyzeOverlay(false, null, false)).toEqual({ visible: false })
  })

  it('shows the ranked analysis with its streaming status message', () => {
    expect(analyzeOverlay(true, 'Found 2 peaks — fetching weather forecasts…', false)).toEqual({
      visible: true,
      source: 'analyze',
      message: 'Found 2 peaks — fetching weather forecasts…',
    })
  })

  it('falls back to "Starting…" before the first analysis status arrives', () => {
    expect(analyzeOverlay(true, null, false)).toEqual({
      visible: true,
      source: 'analyze',
      message: 'Starting…',
    })
  })

  it('shows the pins-only refresh when no ranked analysis is running', () => {
    expect(analyzeOverlay(false, null, true)).toEqual({
      visible: true,
      source: 'pins',
      message: PIN_REFRESH_MESSAGE,
    })
  })

  it('lets the ranked analysis win when both are in flight', () => {
    // A polygon Analyze also refetches pins; the richer analyze message owns
    // the overlay so the two never fight over it.
    const view = analyzeOverlay(true, 'Ranking…', true)
    expect(view).toEqual({ visible: true, source: 'analyze', message: 'Ranking…' })
  })
})
