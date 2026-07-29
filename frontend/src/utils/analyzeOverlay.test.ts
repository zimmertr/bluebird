import { describe, it, expect } from 'vitest'
import { composeOverlay, OverlayInputs, SEARCHING_MESSAGE } from './analyzeOverlay'

const idle: OverlayInputs = {
  analyzeLoading: false,
  statusMessage: null,
  statusDetail: null,
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

  it('surfaces backend failover detail under the search heading', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: SEARCHING_MESSAGE,
      statusDetail: 'Trying backup map server 2 of 3…',
    })
    expect(view.visible && view.detail).toBe('Trying backup map server 2 of 3…')
  })

  it('stages the reassurance line once a search has run 12s', () => {
    const search = { ...idle, analyzeLoading: true, statusMessage: SEARCHING_MESSAGE }
    const early = composeOverlay({ ...search, elapsedS: 11 })
    expect(early.visible && early.detail).toBe(null)
    const late = composeOverlay({ ...search, elapsedS: 12 })
    expect(late.visible && late.detail).toBe(
      'Still searching. Large areas can take up to 30 seconds.'
    )
  })

  it('prefers real failover news over the staged reassurance', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusMessage: SEARCHING_MESSAGE,
      statusDetail: 'Trying backup map server 3 of 3…',
      elapsedS: 40,
    })
    expect(view.visible && view.detail).toBe('Trying backup map server 3 of 3…')
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

  it('drops detail entirely once batch progress takes over', () => {
    const view = composeOverlay({
      ...idle,
      analyzeLoading: true,
      statusDetail: 'Trying backup map server 2 of 3…',
      elapsedS: 40,
      rankedProgress: { processed: 10, total: 100 },
    })
    expect(view.visible && view.detail).toBe(null)
  })
})
