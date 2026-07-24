import { describe, it, expect } from 'vitest'
import { composeOverlay, ANALYZING_MESSAGE, OverlayInputs } from './analyzeOverlay'

// A ranked run mid-weather-fetch with no pins alongside.
const RANKED: OverlayInputs = {
  analyzeLoading: true,
  statusMessage: 'Analyzing Forecasts…',
  rankedProgress: { processed: 3, total: 10 },
  pinsOnly: false,
  pinsCount: 0,
  pinsDone: true,
}

describe('composeOverlay', () => {
  it('is hidden when nothing is in flight', () => {
    expect(
      composeOverlay({
        analyzeLoading: false,
        statusMessage: null,
        rankedProgress: null,
        pinsOnly: false,
        pinsCount: 0,
        pinsDone: true,
      }),
    ).toEqual({ visible: false })
  })

  it('shows the backend phase status before batch progress arrives', () => {
    const view = composeOverlay({ ...RANKED, rankedProgress: null, statusMessage: 'Searching for Destinations…' })
    expect(view).toEqual({ visible: true, message: 'Searching for Destinations…', progress: null })
  })

  it('falls back to Analyzing when a ranked run has no status yet', () => {
    const view = composeOverlay({ ...RANKED, rankedProgress: null, statusMessage: null })
    expect(view).toEqual({ visible: true, message: ANALYZING_MESSAGE, progress: null })
  })

  it('shows Retrieving with the ranked count when no pins ride along', () => {
    const view = composeOverlay(RANKED)
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving Forecasts… (3/10)',
      progress: { processed: 3, total: 10, percent: 30 },
    })
  })

  it('folds pins into the union total, counting them only once resolved', () => {
    // 2 discovered + 1 pin still fetching → total 3, done 2 → "(2/3)".
    const fetching = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 2, total: 2 },
      pinsCount: 1,
      pinsDone: false,
    })
    expect(fetching.visible && fetching.message).toBe('Retrieving Forecasts… (2/3)')
    expect(fetching.visible && fetching.progress).toEqual({ processed: 2, total: 3, percent: 67 })

    // Once the pin lands → "(3/3)".
    const done = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 2, total: 2 },
      pinsCount: 1,
      pinsDone: true,
    })
    expect(done.visible && done.message).toBe('Retrieving Forecasts… (3/3)')
    expect(done.visible && done.progress?.percent).toBe(100)
  })

  it('shows indeterminate Analyzing for a pins-only refresh', () => {
    const view = composeOverlay({
      analyzeLoading: false,
      statusMessage: null,
      rankedProgress: null,
      pinsOnly: true,
      pinsCount: 3,
      pinsDone: false,
    })
    expect(view).toEqual({ visible: true, message: ANALYZING_MESSAGE, progress: null })
  })
})
