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

  it('shows the plural count while a multi-row fetch is in progress', () => {
    expect(composeOverlay(RANKED)).toEqual({
      visible: true,
      message: 'Retrieving Forecasts… (3/10)',
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

  it('folds pins into the union count, counting them only once resolved', () => {
    // 2 discovered + 1 pin still fetching → total 3, done 2 → "(2/3)".
    const fetching = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 2, total: 2 },
      pinsCount: 1,
      pinsDone: false,
    })
    expect(fetching.visible && fetching.message).toBe('Retrieving Forecasts… (2/3)')

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

  it('a lone discovered peak plus one pin is still plural (union = 2)', () => {
    const view = composeOverlay({
      ...RANKED,
      rankedProgress: { processed: 1, total: 1 },
      pinsCount: 1,
      pinsDone: true,
    })
    expect(view.visible && view.message).toBe('Retrieving Forecasts… (2/2)')
  })

  it('pins-only shows the singular/plural label with no live count', () => {
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
    expect(many).toEqual({ visible: true, message: 'Retrieving Forecasts…', progress: null })
  })
})
