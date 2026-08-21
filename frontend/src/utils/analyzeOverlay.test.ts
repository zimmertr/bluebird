import { describe, it, expect } from 'vitest'
import { composeOverlay, OverlayInputs, SEARCHING_MESSAGE } from './analyzeOverlay'

const idle: OverlayInputs = {
  analyzeLoading: false,
  statusMessage: null,
  elapsedS: 0,
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
      statusMessage: SEARCHING_MESSAGE,
    })
    expect(view).toEqual({
      visible: true,
      message: 'Searching for Destinations…',
      detail: null,
      progress: null,
    })
  })

  it('falls back to a generic retrieving label in the status gap', () => {
    const view = composeOverlay({ ...idle, analyzeLoading: true })
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving Forecasts…',
      detail: null,
      progress: null,
    })
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
      detail: null,
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

  it('shows reassurance once a search runs long', () => {
    const search = { ...idle, analyzeLoading: true, statusMessage: SEARCHING_MESSAGE }
    const early = composeOverlay({ ...search, elapsedS: 19 })
    expect(early.visible && early.detail).toBe(null)
    const staged = composeOverlay({ ...search, elapsedS: 20 })
    expect(staged.visible && staged.detail).toBe(
      'Still searching. Large analyses can take a while.'
    )
    // Same message after more time has elapsed
    const long = composeOverlay({ ...search, elapsedS: 45 })
    expect(long.visible && long.detail).toBe(
      'Still searching. Large analyses can take a while.'
    )
  })

  it('never stages the searching reassurance outside the search phase', () => {
    // The retrieval gap (statusMessage null) and a custom run's seeded
    // "Retrieving Forecasts…" heading must not claim we are still searching.
    const gap = composeOverlay({ ...idle, analyzeLoading: true, elapsedS: 30 })
    expect(gap.visible && gap.detail).toBe(null)
    const custom = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: 'Retrieving Forecasts…',
      elapsedS: 30,
    })
    expect(custom.visible && custom.detail).toBe(null)
  })

  it('renders the pace countdown during retrieval', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 550, total: 908 },
      paceRemainingS: 34,
    })
    expect(view.visible && view.detail).toBe('Open-Meteo quota: resuming in 34s')
    const done = composeOverlay({
      ...idle,
      analyzeLoading: true,
      rankedProgress: { processed: 550, total: 908 },
      paceRemainingS: 0,
    })
    expect(done.visible && done.detail).toBe(null)
  })
})
