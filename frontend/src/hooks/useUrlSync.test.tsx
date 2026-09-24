import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { type UrlSyncInputs, useUrlSync } from './useUrlSync'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { DEFAULT_SELECTION } from '../utils/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_LIMIT, DEFAULT_SORT } from '../utils/urlState'

const NO_TYPES: UrlSyncInputs['destinationTypes'] = []
const NO_MODELS: UrlSyncInputs['comparedModels'] = []
const NO_PLACES: UrlSyncInputs['places'] = []
const DEBOUNCE_MS = 400

// Every input at its default, so the link is the bare path.
function inputs(over: Partial<UrlSyncInputs> = {}): UrlSyncInputs {
  return {
    polygon: null,
    destinationTypes: NO_TYPES,
    includeUnnamedPeaks: false,
    selection: DEFAULT_SELECTION,
    forecastModel: 'gfs_seamless',
    comparedModels: NO_MODELS,
    sortBy: DEFAULT_SORT,
    sortDesc: false,
    rowKeys: DEFAULT_FAMILY_KEY,
    constraints: NO_CONSTRAINTS,
    limit: DEFAULT_LIMIT,
    customCsv: '',
    showWildfires: false,
    showRadar: false,
    showSmoke: false,
    showSnow: false,
    showGrid: false,
    showPlayer: null,
    gridStyle: 'smooth',
    gridReachFrac: 0.5,
    places: NO_PLACES,
    defaultForecastModel: 'gfs_seamless',
    ...over,
  }
}

let replace: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/')
  replace = vi.spyOn(window.history, 'replaceState')
})
afterEach(() => {
  replace.mockRestore()
  vi.useRealTimers()
})

describe('useUrlSync', () => {
  it('writes nothing while the address bar already says what the panel does', () => {
    renderHook(() => useUrlSync(inputs()))
    vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    expect(replace).not.toHaveBeenCalled()
  })

  // A burst of edits is one write, a debounce after the last.
  it('writes a change once, after the debounce', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    rerender(inputs({ customCsv: '47.5' }))
    rerender(inputs({ customCsv: '47.5,-121' }))
    expect(replace).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(replace).toHaveBeenCalledOnce()
    expect(window.location.search).not.toBe('')
  })

  // An edit that lands back on the address bar's state drops what was queued.
  it('drops a queued write when the state comes back to the address bar', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    rerender(inputs({ showSmoke: true }))
    rerender(inputs())
    vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    expect(replace).not.toHaveBeenCalled()
  })

  it('flushes a queued write on unmount', () => {
    const { rerender, unmount } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    rerender(inputs({ showRadar: true }))
    unmount()
    expect(replace).toHaveBeenCalledOnce()
  })

  // The writer outlives every render: a new one per render would drop the
  // timer the debounce is counting down.
  it('hands back the same writer on every render, and its flush writes now', () => {
    const { result, rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    const writer = result.current
    rerender(inputs({ limit: 50 }))
    expect(result.current).toBe(writer)
    result.current.flush()
    expect(replace).toHaveBeenCalledOnce()
  })
})
