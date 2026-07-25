import { describe, it, expect } from 'vitest'
import { composeOverlay, OverlayInputs } from './analyzeOverlay'

const idle: OverlayInputs = {
  analyzeLoading: false,
  statusMessage: null,
  rankedProgress: null,
}

describe('composeOverlay', () => {
  it('is hidden when no analysis is running', () => {
    expect(composeOverlay(idle)).toEqual({ visible: false })
  })

  it('shows the backend phase status before any batch progress exists', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'Searching for Destinations…',
    })
    expect(view).toEqual({
      visible: true,
      message: 'Searching for Destinations…',
      progress: null,
    })
  })

  it('falls back to a generic retrieving label in the status gap', () => {
    const view = composeOverlay({ ...idle, analyzeLoading: true })
    expect(view).toEqual({ visible: true, message: 'Retrieving Forecasts…', progress: null })
  })

  it('names the total and carries batch progress in the weather phase', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'ignored once progress exists',
      rankedProgress: { processed: 50, total: 200 },
    })
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving 200 Forecasts…',
      progress: { processed: 50, total: 200, percent: 25 },
    })
  })

  it('uses the singular label for exactly one forecast', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 0, total: 1 },
    })
    expect(view.visible && view.message).toBe('Retrieving Forecast…')
  })
})
