import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AnalyzeRequest, DestinationResult } from '../types'
import { useAnalyze } from './useAnalyze'
import { runClientAnalysis } from '../utils/clientAnalyze'
import { discoveryKeys } from '../utils/present'
import { discovered, fakeResponse, resultRow } from '../testSupport/fixtures'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'

// The ranking is clientAnalyze.ts's and has its own suite. A spy here shows
// what the hook hands it: above all, whether a held field rides along.
vi.mock('../utils/clientAnalyze', async (actual) => ({
  ...(await actual<typeof import('../utils/clientAnalyze')>()),
  runClientAnalysis: vi.fn(),
}))
const ranked = vi.mocked(runClientAnalysis)

const MIN = 60_000
const T0 = Date.parse('2026-07-20T12:00:00Z')
const PROBE = { name: 'Probe', latitude: 47.1, longitude: -121.2 }
const REQUEST: AnalyzeRequest = {
  destination_types: [],
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  forecast_model: 'gfs_seamless',
  limit: 25,
  custom_destinations: [PROBE],
}
const ROWS: DestinationResult[] = [resultRow({ ...PROBE })]
const DATA = { results: ROWS, total_queried: 1, total_matched: 1, times: [1] }

// What resolving the custom list answers, with a snow date or without one.
function stubResolve(snowDate: string | null = null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => fakeResponse({ destinations: [discovered({ ...PROBE, type: 'custom' })], total: 1, snow_analysis_date: snowDate })),
  )
}

// The `reuse` each call to the ranking was handed, in order.
const reuses = () => ranked.mock.calls.map((c) => c[4]!.reuse ?? null)

async function analyzeAt(result: { current: ReturnType<typeof useAnalyze> }, atMs: number) {
  vi.setSystemTime(atMs)
  await act(() => result.current.analyze(REQUEST))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  ranked.mockReset()
  ranked.mockResolvedValue({ response: DATA, universe: ROWS })
  stubResolve()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the forecast reuse', () => {
  it('reuses at +14 min and refuses at +16 from the FIRST fetch, though the last run was two minutes ago', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    await analyzeAt(result, T0 + 14 * MIN)
    await analyzeAt(result, T0 + 16 * MIN)
    expect(reuses()).toEqual([null, { rows: ROWS, times: [1] }, null])
  })

  it('refuses at exactly fifteen minutes', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    await analyzeAt(result, T0 + 15 * MIN)
    expect(reuses()).toEqual([null, null])
  })

  it('holds nothing from a run that failed after rows arrived', async () => {
    ranked.mockImplementationOnce(async (_r, _c, _s, _e, cb) => {
      cb!.onPartial!(ROWS, [1])
      throw new Error('Broken.')
    })
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    await analyzeAt(result, T0 + MIN)
    expect(reuses()).toEqual([null, null])
  })

  it('holds nothing after a reset', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    act(() => result.current.reset())
    await analyzeAt(result, T0 + MIN)
    expect(reuses()).toEqual([null, null])
  })
})

describe('one analysis', () => {
  it('commits the report, counts it once, and publishes the fire field once', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    expect(result.current).toMatchObject({
      response: DATA, universe: ROWS, analysisSeq: 1, fireSeq: 1, arriving: false, loading: false,
      fireField: [{ latitude: PROBE.latitude, longitude: PROBE.longitude }],
    })
  })

  it('keeps the last report through a failure, drops the fire field, and shows the error', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0 + MIN)
    expect(result.current).toMatchObject({ response: DATA, analysisSeq: 1, fireSeq: 2, fireField: null, error: 'Broken.' })
  })

  it('records the snow date of its own discovery, never the last one', async () => {
    const { result } = renderHook(() => useAnalyze())
    stubResolve('2026-07-19')
    await analyzeAt(result, T0)
    expect(result.current.analyzed?.snowAnalysisDate).toBe('2026-07-19')
    stubResolve(null)
    await analyzeAt(result, T0 + MIN)
    expect(result.current.analyzed?.snowAnalysisDate).toBeNull()
  })

  it('records the discovery a refresh names, and a retry repeats it', async () => {
    const { result } = renderHook(() => useAnalyze())
    const discovery = discoveryKeys({ coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] }, ['peak'], false)
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await act(() => result.current.analyze(REQUEST, 'days', { discovery, compareModels: ['icon_seamless'] }))
    await act(async () => result.current.retry())
    await vi.waitFor(() => expect(result.current.analysisSeq).toBe(1))
    expect(result.current.analyzed).toMatchObject({ ...discovery, compareModels: ['icon_seamless'] })
    expect(result.current.error).toBeNull()
  })
})

describe('what the reader sees', () => {
  it('opens a ring on the search label and a custom list on retrieval', async () => {
    const ring = { type: 'Polygon' as const, coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
    const cases: [AnalyzeRequest, string][] = [
      [{ ...REQUEST, polygon: ring, destination_types: ['peak'] }, SEARCHING_MESSAGE],
      [REQUEST, 'Retrieving Forecasts…'],
    ]
    for (const [request, seed] of cases) {
      // The server holds its answer, so the label the run opened on is on screen.
      let answer!: (r: Response) => void
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))))
      const { result } = renderHook(() => useAnalyze())
      let done!: Promise<void>
      act(() => {
        done = result.current.analyze(request)
      })
      expect(result.current.statusMessage).toBe(seed)
      await act(async () => {
        answer(fakeResponse({ destinations: [discovered({ ...PROBE })], total: 1 }))
        await done
      })
    }
  })

  it('clears the error and the refusal on reset', async () => {
    const { result } = renderHook(() => useAnalyze())
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0)
    expect(result.current.error).toBe('Broken.')
    act(() => result.current.reset())
    expect(result.current).toMatchObject({ error: null, refusal: null, response: null, universe: null, analyzed: null })
  })

  it('leaves the rows that arrived on screen, no longer arriving, when the run fails', async () => {
    const partial = { results: ROWS, total_queried: 1, total_matched: 1, times: [1] }
    ranked.mockImplementationOnce(async (_r, _c, _s, _e, cb) => {
      cb!.onPartial!(ROWS, [1])
      throw new Error('Broken.')
    })
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    expect(result.current).toMatchObject({ response: partial, universe: ROWS, arriving: false, analysisSeq: 0, error: 'Broken.' })
  })
})

describe('the returned API', () => {
  // App.tsx destructures these by name; the split must not move one.
  it('is the same set of names in the same order', () => {
    const { result } = renderHook(() => useAnalyze())
    expect(Object.keys(result.current)).toEqual([
      'analyze', 'cancel', 'retry', 'reset', 'analyzed', 'analysisSeq', 'fireField', 'fireSeq', 'loading',
      'arriving', 'error', 'refusal', 'response', 'universe', 'statusMessage', 'progress', 'paceRemainingS',
    ])
  })
})
