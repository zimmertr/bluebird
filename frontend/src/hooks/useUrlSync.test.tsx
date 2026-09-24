import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type UrlSyncInputs, useUrlSync } from './useUrlSync'
import { DEFAULT_FAMILY_KEY } from '../metrics'
import { DEFAULT_SELECTION } from '../utils/calendar'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { DEFAULT_LIMIT, DEFAULT_SORT } from '../utils/urlState'

const NO_TYPES: UrlSyncInputs['destinationTypes'] = []
const NO_MODELS: UrlSyncInputs['comparedModels'] = []
const NO_PLACES: UrlSyncInputs['places'] = []
const NO_KEYS: UrlSyncInputs['removedKeys'] = new Set()
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
    removedKeys: NO_KEYS,
    tableSort: null,
    restoredView: null,
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

  // The model is part of what the numbers mean, so a link copied straight
  // after a model change must carry the new one, with no other edit to help.
  it('writes a model change alone', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), {
      initialProps: inputs({ showRadar: true }),
    })
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(new URLSearchParams(window.location.search).get('model')).toBe('gfs_seamless')
    rerender(inputs({ showRadar: true, forecastModel: 'ecmwf_ifs025' }))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(new URLSearchParams(window.location.search).get('model')).toBe('ecmwf_ifs025')
  })

  // The deployment's default arrives from /api/capabilities after the first
  // render. A panel model that was the compiled default and is not the
  // published one is a real choice, and the link must appear for it.
  it('writes when the published default model moves off the panel model', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), {
      initialProps: inputs({ forecastModel: 'ecmwf_ifs025', defaultForecastModel: 'ecmwf_ifs025' }),
    })
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(window.location.search).toBe('')
    rerender(inputs({ forecastModel: 'ecmwf_ifs025', defaultForecastModel: 'gfs_seamless' }))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(new URLSearchParams(window.location.search).get('model')).toBe('ecmwf_ifs025')
  })

  // The writer outlives every render: a new one per render would drop the
  // timer the debounce is counting down.
  it('hands back the same writer on every render, and its flush writes now', () => {
    const { result, rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    const writer = result.current
    rerender(inputs({ limit: 50 }))
    expect(result.current).toBe(writer)
    result.current.writeUrl.flush()
    expect(replace).toHaveBeenCalledOnce()
  })
})

describe('the camera in the link', () => {
  const VIEW = { lng: -121.7601, lat: 46.8529, zoom: 10.5 }
  const params = () => new URLSearchParams(window.location.search)

  // TJ's rule: a pan or a zoom alone makes a link.
  it('writes a link for a reader move alone', () => {
    const { result } = renderHook(() => useUrlSync(inputs()))
    act(() => result.current.reportView(VIEW, true))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(params().get('view')).toBe('-121.7601,46.8529,10.5')
  })

  // The opening camera and every app fit keep the camera current and nothing more.
  it('writes nothing for an app move alone', () => {
    const { result } = renderHook(() => useUrlSync(inputs()))
    act(() => result.current.reportView(VIEW, false))
    vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    expect(replace).not.toHaveBeenCalled()
  })

  // The camera writes outside the sync effect, so it must write with the
  // state as it is now, not as it was when the callback was made.
  it('carries the latest state beside a pan made after a change', () => {
    const { result, rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    const reportView = result.current.reportView
    rerender(inputs({ showRadar: true }))
    act(() => reportView(VIEW, false))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(params().get('radar')).toBe('1')
    expect(params().get('view')).toBe('-121.7601,46.8529,10.5')
  })

  // A link's camera is the sender's own move, so it makes the link by itself.
  it('keeps a link that carries a camera alone', () => {
    window.history.replaceState(null, '', '/?view=-121.7601,46.8529,10.5')
    renderHook(() => useUrlSync(inputs({ restoredView: VIEW })))
    vi.advanceTimersByTime(DEBOUNCE_MS * 2)
    expect(params().get('view')).toBe('-121.7601,46.8529,10.5')
  })

  it('keeps a link\'s camera when its other reason goes', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), {
      initialProps: inputs({ showRadar: true, restoredView: VIEW }),
    })
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(params().get('radar')).toBe('1')
    rerender(inputs({ restoredView: VIEW }))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(params().has('radar')).toBe(false)
    expect(params().get('view')).toBe('-121.7601,46.8529,10.5')
  })

  it('flushes a pending camera write on unmount', () => {
    const { result, unmount } = renderHook(() => useUrlSync(inputs()))
    act(() => result.current.reportView(VIEW, true))
    unmount()
    expect(replace).toHaveBeenCalledOnce()
    expect(params().get('view')).toBe('-121.7601,46.8529,10.5')
  })

  it('writes the removals and the header sort it is handed', () => {
    const { rerender } = renderHook((p: UrlSyncInputs) => useUrlSync(p), { initialProps: inputs() })
    rerender(inputs({ removedKeys: new Set(['46.85289,-121.76041']), tableSort: { key: 'name', desc: true } }))
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(params().get('removed')).toBe('-121.76041,46.85289')
    expect(params().get('tsort')).toBe('name')
    expect(params().get('tdesc')).toBe('1')
  })
})
