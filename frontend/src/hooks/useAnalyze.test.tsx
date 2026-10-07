import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AnalyzeRequest, DestinationResult, GeoPolygon } from '../types'
import { useAnalyze } from './useAnalyze'
import { runClientAnalysis, type HeldColumns } from '../utils/clientAnalyze'
import { discoveryKeys } from '../utils/present'
import { discovered, fakeResponse, resultRow } from '../testSupport/fixtures'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { geoKey } from '../utils/points'

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
  // The real ranking never returns before the lookup it was handed has
  // answered (#643), and the hook's snow date depends on that order.
  ranked.mockImplementation(async (_request, _candidates, _startMs, _endMs, callbacks) => {
    await callbacks?.resolving
    return { response: DATA, universe: ROWS, aqiFailed: new Set<string>(), columns: new Map(), late: null }
  })
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
    expect(reuses()).toEqual([null, { rows: ROWS, times: [1], aqiFailed: new Set(), columns: new Map() }, null])
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

  it('keeps the last report and its fire field through a failure, and shows the error', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    const field = result.current.fireField
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0 + MIN)
    expect(result.current).toMatchObject({ response: DATA, analysisSeq: 1, fireSeq: 2, error: { message: 'Broken.', retry: true } })
    expect(result.current.fireField).toBe(field)
  })

  // #560: the click keeps its bookkeeping off a run that changed nothing.
  it('resolves true on a commit and false on a failure', async () => {
    const { result } = renderHook(() => useAnalyze())
    const outcomes: boolean[] = []
    await act(async () => {
      outcomes.push(await result.current.analyze(REQUEST))
    })
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await act(async () => {
      outcomes.push(await result.current.analyze(REQUEST))
    })
    expect(outcomes).toEqual([true, false])
  })

  // The click's bookkeeping runs with the commit, and a retry's commit is the
  // click's, so it runs then too.
  it('runs the commit hook on a commit only, including the commit of a retry', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useAnalyze())
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await act(() => result.current.analyze(REQUEST, 'days', { onCommit }))
    expect(onCommit).not.toHaveBeenCalled()
    await act(async () => result.current.retry())
    await vi.waitFor(() => expect(result.current.analysisSeq).toBe(1))
    expect(onCommit).toHaveBeenCalledOnce()
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

// #673: a lookup that answers after the report lands on the committed report
// and on the held field, unless the report it belonged to is gone.
describe('a lookup that answers after the report', () => {
  const KEY = geoKey(PROBE.latitude, PROBE.longitude)
  const PATCHED = resultRow({ ...PROBE, elevation_ft: 6000 })
  function deferred() {
    let resolve!: (p: { rows: DestinationResult[]; columns: Map<string, HeldColumns>; snowAnalysisDate: string | null }) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<{ rows: DestinationResult[]; columns: Map<string, HeldColumns>; snowAnalysisDate: string | null }>(
      (res, rej) => {
        resolve = res
        reject = rej
      },
    )
    return { promise, resolve, reject }
  }
  function rankLate(late: Promise<{ rows: DestinationResult[]; columns: Map<string, HeldColumns>; snowAnalysisDate: string | null }>) {
    ranked.mockImplementationOnce(async () => ({
      response: DATA,
      universe: ROWS,
      aqiFailed: new Set<string>(),
      columns: new Map([[KEY, { weather: { hourly: { time: [] } } }]]),
      late,
    }))
  }

  it('lands the answer on the committed report, the snapshot and the held field', async () => {
    const { result } = renderHook(() => useAnalyze())
    // The date rides on the patch from the lookup's own answer.
    stubResolve('2026-07-19')
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    expect([...result.current.pendingHeights]).toEqual([KEY])
    expect(result.current.analyzed?.snowAnalysisDate).toBeNull()
    await act(async () => {
      late.resolve({ rows: [PATCHED], columns: new Map(), snowAnalysisDate: '2026-07-19' })
      await late.promise
    })
    expect(result.current.universe?.[0]).toBe(PATCHED)
    expect(result.current.response?.results[0]).toBe(PATCHED)
    expect(result.current.pendingHeights.size).toBe(0)
    expect(result.current.analyzed?.snowAnalysisDate).toBe('2026-07-19')
    // The same report, filled in, rather than another one.
    expect(result.current.analysisSeq).toBe(1)
    await analyzeAt(result, T0 + MIN)
    expect(reuses()[1]?.rows[0]).toBe(PATCHED)
    expect(reuses()[1]?.columns?.size).toBe(0)
  })

  it('drops an answer that arrives after a reset or after the next run', async () => {
    const { result } = renderHook(() => useAnalyze())
    const first = deferred()
    rankLate(first.promise)
    await analyzeAt(result, T0)
    act(() => result.current.reset())
    await act(async () => {
      first.resolve({ rows: [PATCHED], columns: new Map(), snowAnalysisDate: '2026-07-19' })
      await first.promise
    })
    expect(result.current.universe).toBeNull()
    expect(result.current.pendingHeights.size).toBe(0)

    const second = deferred()
    rankLate(second.promise)
    await analyzeAt(result, T0 + MIN)
    await analyzeAt(result, T0 + 2 * MIN)
    await act(async () => {
      second.resolve({ rows: [PATCHED], columns: new Map(), snowAnalysisDate: '2026-07-19' })
      await second.promise
    })
    expect(result.current.universe?.[0]).toBe(ROWS[0])
    expect(result.current.analyzed?.snowAnalysisDate).toBeNull()
  })

  it('places held rows from an answer that arrives after the lookup gave up', async () => {
    const { result } = renderHook(() => useAnalyze())
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    // The run's own lookup gave up: nothing placed, the column still held.
    await act(async () => {
      late.resolve({ rows: [], columns: new Map([[KEY, { weather: { hourly: { time: [] } } }]]), snowAnalysisDate: null })
      await late.promise
    })
    expect(result.current.pendingHeights.size).toBe(0)
    expect(result.current.universe?.[0].elevation_ft).toBeNull()
    // The paste-time lookup's retry answers: the row takes its elevation.
    act(() => result.current.placeHeld([discovered({ ...PROBE, type: 'custom', elevation_ft: 6000, osm_id: 'node/1' })]))
    expect(result.current.universe?.[0]).toMatchObject({ elevation_ft: 6000, osm_id: 'node/1' })
    await analyzeAt(result, T0 + MIN)
    expect(reuses()[1]?.rows[0]).toMatchObject({ elevation_ft: 6000 })
  })

  it('stops the waiting cells when the lookup is aborted', async () => {
    const { result } = renderHook(() => useAnalyze())
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    expect(result.current.pendingHeights.size).toBe(1)
    await act(async () => {
      late.reject(new DOMException('Aborted', 'AbortError'))
      await late.promise.catch(() => {})
    })
    expect(result.current.pendingHeights.size).toBe(0)
    expect(result.current.universe).toBe(ROWS)
  })
})

describe('what the reader sees', () => {
  // A run with no polygon asks for its forecasts at once, beside the pod's
  // elevation lookup (#643), so that is what it opens on.
  it('opens a ring on the search label and a custom list on the forecast label', async () => {
    const ring: GeoPolygon = { type: 'Polygon', coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
    const cases: [AnalyzeRequest, string][] = [
      [{ ...REQUEST, polygon: ring, destination_types: ['peak'] }, SEARCHING_MESSAGE],
      [REQUEST, 'Retrieving forecasts…'],
    ]
    for (const [request, seed] of cases) {
      // The server holds its answer, so the label the run opened on is on screen.
      let answer!: (r: Response) => void
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))))
      const { result } = renderHook(() => useAnalyze())
      let done!: Promise<boolean>
      act(() => {
        done = result.current.analyze(request)
      })
      expect(result.current.statusMessage).toBe(seed)
      // The custom list is sent once the paste-time lookup has settled, which
      // is a tick after the click (#673).
      await act(async () => {
        await vi.waitFor(() => expect(answer).toBeDefined())
        answer(fakeResponse({ destinations: [discovered({ ...PROBE })], total: 1 }))
        await done
      })
    }
  })

  it('clears the error and the refusal on reset', async () => {
    const { result } = renderHook(() => useAnalyze())
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0)
    expect(result.current.error).toEqual({ message: 'Broken.', retry: true })
    act(() => result.current.reset())
    expect(result.current).toMatchObject({ error: null, refusal: null, response: null, universe: null, analyzed: null })
  })

  // #560: a run that does not finish changes nothing. Its rows go with it,
  // and with no report before it the screen is back to none.
  it('drops the rows that arrived when the run fails, and shows the error over no report', async () => {
    ranked.mockImplementationOnce(async (_r, _c, _s, _e, cb) => {
      cb!.onPartial!(ROWS, [1])
      throw new Error('Broken.')
    })
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    expect(result.current).toMatchObject({
      response: null, universe: null, analyzed: null, arriving: false, analysisSeq: 0, error: { message: 'Broken.', retry: true },
    })
  })
})

describe('the returned API', () => {
  // App.tsx destructures these by name; the split must not move one.
  it('is the same set of names in the same order', () => {
    const { result } = renderHook(() => useAnalyze())
    expect(Object.keys(result.current)).toEqual([
      'analyze', 'cancel', 'retry', 'reset', 'placeHeld', 'analyzed', 'analysisSeq', 'discardSeq', 'fireField', 'fireSeq', 'loading',
      'arriving', 'error', 'refusal', 'response', 'universe', 'pendingHeights', 'statusMessage', 'progress', 'paceRemainingS',
    ])
  })
})
