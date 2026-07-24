import { describe, it, expect } from 'vitest'
import { composeOverlay, OverlayInputs } from './analyzeOverlay'

// A ranked run mid-weather-fetch with no pins alongside.
const RANKED: OverlayInputs = {
  analyzeLoading: true,
  statusMessage: 'Retrieving Forecasts…',
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

  it('names the total (not a fraction), and keeps the filling bar', () => {
    expect(composeOverlay(RANKED)).toEqual({
      visible: true,
      message: 'Retrieving 10 Forecasts…',
      progress: { processed: 3, total: 10, percent: 30 },
    })
  })

  it('drops the count and pluralization for a lone forecast', () => {
    const view = composeOverlay({ ...RANKED, rankedProgress: { processed: 0, total: 1 } })
    expect(view).toEqual({
      visible: true,
      message: 'Retrieving Forecast…',
      progress: { processed: 0, total: 1, percent: 0 },
    })
  })

  it('folds pins into the union total (label) and the bar (once resolved)', () => {
    // 2 discovered + 1 pin still fetching → total 3; bar at 2/3, label "3".
    const fetching = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 2, total: 2 },
      pinsCount: 1,
      pinsDone: false,
    })
    expect(fetching).toEqual({
      visible: true,
      message: 'Retrieving 3 Forecasts…',
      progress: { processed: 2, total: 3, percent: 67 },
    })

    // Once the pin lands, the bar reaches 3/3; the label is unchanged.
    const done = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 2, total: 2 },
      pinsCount: 1,
      pinsDone: true,
    })
    expect(done.visible && done.message).toBe('Retrieving 3 Forecasts…')
    expect(done.visible && done.progress?.percent).toBe(100)
  })

  it('pins-only names the total over an indeterminate bar (no live fraction)', () => {
    const one = composeOverlay({
      analyzeLoading: false,
      statusMessage: null,
      rankedProgress: null,
      pinsOnly: true,
      pinsCount: 1,
      pinsDone: false,
    })
    expect(one).toEqual({ visible: true, message: 'Retrieving Forecast…', progress: null })

    const many = composeOverlay({
      analyzeLoading: false,
      statusMessage: null,
      rankedProgress: null,
      pinsOnly: true,
      pinsCount: 4,
      pinsDone: false,
    })
    expect(many).toEqual({ visible: true, message: 'Retrieving 4 Forecasts…', progress: null })
  })
})
