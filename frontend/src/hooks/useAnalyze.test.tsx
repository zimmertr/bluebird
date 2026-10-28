import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { AnalyzeRequest, DestinationResult, GeoPolygon } from '../types'
import { useAnalyze } from './useAnalyze'
import { runClientAnalysis, type HeldColumns } from '../utils/clientAnalyze'
import { discoveryKeys } from '../utils/present'
import { discovered, fakeResponse, resultRow } from '../testSupport/fixtures'
import { SEARCHING_MESSAGE } from '../utils/analyzeOverlay'
import { geoKey } from '../utils/points'
import { fieldKey } from '../utils/destinationCount'

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

// What resolving the custom list answers.
function stubResolve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => fakeResponse({ destinations: [discovered({ ...PROBE, type: 'custom' })], total: 1 })),
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
  // answered (#643).
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

// Every committed run moves the report's "as of" (TJ, 2026-10-14), one that
// reused every forecast it held included: two presses a few seconds apart
// used to show the same minute, and the app looked as if it had not heard
// the second.
describe('the report\'s stamp', () => {
  it('moves on every commit, a full reuse included', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    expect(result.current.analyzed?.asOfMs).toBe(T0)
    await analyzeAt(result, T0 + 3_000)
    expect(reuses()[1]).not.toBeNull()
    expect(result.current.analyzed?.asOfMs).toBe(T0 + 3_000)
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

  // The click's bookkeeping runs with the commit, not with the click, so a
  // failed click's does not run and the next click's does.
  it('runs the commit hook on a commit only', async () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useAnalyze())
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await act(() => result.current.analyze(REQUEST, 'days', { onCommit }))
    expect(onCommit).not.toHaveBeenCalled()
    await act(() => result.current.analyze(REQUEST, 'days', { onCommit }))
    await vi.waitFor(() => expect(result.current.analysisSeq).toBe(1))
    expect(onCommit).toHaveBeenCalledOnce()
  })

  it('records the discovery a refresh names', async () => {
    const { result } = renderHook(() => useAnalyze())
    const discovery = discoveryKeys({ coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] }, ['peak'], false)
    await act(() => result.current.analyze(REQUEST, 'days', { discovery, compareModels: ['icon_seamless'] }))
    expect(result.current.analyzed).toMatchObject({ ...discovery, compareModels: ['icon_seamless'] })
  })

  // #736: the Analyze button reads `Try again` against the snapshot of the run
  // that failed, not the report's, which a failure puts back untouched (#560).
  it('keeps the failed run\'s snapshot beside the error, and drops it when a run starts', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    expect(result.current.failedView).toBeNull()
    const discovery = discoveryKeys({ coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] }, ['peak'], false)
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await act(() => result.current.analyze({ ...REQUEST, forecast_model: 'ecmwf_ifs025' }, 'days', { discovery }))
    expect(result.current.error).toEqual({ message: 'Broken.', retry: true })
    expect(result.current.failedView).toMatchObject({ ...discovery, forecastModel: 'ecmwf_ifs025' })
    // The committed report still describes the first run.
    expect(result.current.analyzed?.forecastModel).toBe(REQUEST.forecast_model)
    let release!: () => void
    ranked.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (release = r))
      return { response: DATA, universe: ROWS, aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
    let run!: Promise<boolean>
    act(() => {
      run = result.current.analyze(REQUEST)
    })
    expect(result.current.failedView).toBeNull()
    await act(async () => {
      release()
      await run
    })
    expect(result.current.failedView).toBeNull()
  })

  // Dismissing the error line clears the event, so the button's word reverts
  // at once; the next failure sets it afresh.
  it('clears the error on dismissal, and sets it again on the next failure', async () => {
    const { result } = renderHook(() => useAnalyze())
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0)
    expect(result.current.error).not.toBeNull()
    act(() => result.current.dismissEvent('error'))
    expect(result.current.error).toBeNull()
    ranked.mockRejectedValueOnce(new Error('Broken.'))
    await analyzeAt(result, T0)
    expect(result.current.error).toEqual({ message: 'Broken.', retry: true })
  })
})

// #673: a lookup that answers after the report lands on the committed report
// and on the held field, unless the report it belonged to is gone.
describe('a lookup that answers after the report', () => {
  const KEY = geoKey(PROBE.latitude, PROBE.longitude)
  const PATCHED = resultRow({ ...PROBE, elevation_ft: 6000 })
  function deferred() {
    let resolve!: (p: { rows: DestinationResult[]; columns: Map<string, HeldColumns> }) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<{ rows: DestinationResult[]; columns: Map<string, HeldColumns> }>(
      (res, rej) => {
        resolve = res
        reject = rej
      },
    )
    return { promise, resolve, reject }
  }
  function rankLate(late: Promise<{ rows: DestinationResult[]; columns: Map<string, HeldColumns> }>) {
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
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    expect([...result.current.pendingHeights]).toEqual([KEY])
    await act(async () => {
      late.resolve({ rows: [PATCHED], columns: new Map() })
      await late.promise
    })
    expect(result.current.universe?.[0]).toBe(PATCHED)
    expect(result.current.response?.results[0]).toBe(PATCHED)
    expect(result.current.pendingHeights.size).toBe(0)
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
      first.resolve({ rows: [PATCHED], columns: new Map() })
      await first.promise
    })
    expect(result.current.universe).toBeNull()
    expect(result.current.pendingHeights.size).toBe(0)

    const second = deferred()
    rankLate(second.promise)
    await analyzeAt(result, T0 + MIN)
    await analyzeAt(result, T0 + 2 * MIN)
    await act(async () => {
      second.resolve({ rows: [PATCHED], columns: new Map() })
      await second.promise
    })
    expect(result.current.universe?.[0]).toBe(ROWS[0])
  })

  it('places held rows from an answer that arrives after the lookup gave up', async () => {
    const { result } = renderHook(() => useAnalyze())
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    // The run's own call placed nothing, the column still held.
    await act(async () => {
      late.resolve({ rows: [], columns: new Map([[KEY, { weather: { hourly: { time: [] } } }]]) })
      await late.promise
    })
    expect(result.current.pendingHeights.size).toBe(1)
    expect(result.current.universe?.[0].elevation_ft).toBeNull()
    // The paste-time lookup's retry answers: the row takes its elevation.
    act(() => result.current.placeHeld([discovered({ ...PROBE, type: 'custom', elevation_ft: 6000, osm_id: 'node/1' })]))
    expect(result.current.universe?.[0]).toMatchObject({ elevation_ft: 6000, osm_id: 'node/1' })
    await analyzeAt(result, T0 + MIN)
    expect(reuses()[1]?.rows[0]).toMatchObject({ elevation_ft: 6000 })
  })

  // #673: the lookup placed the row while the run was fetching, after the
  // run had read what was known; the commit takes that answer at once.
  it('places a waiting row from what the lookup learned during the run', async () => {
    const { result } = renderHook(() => useAnalyze())
    const late = deferred()
    rankLate(late.promise)
    const learned = new Map([[KEY, { elevation_ft: 6000, osm_id: 'node/1' }]])
    vi.setSystemTime(T0)
    await act(() => result.current.analyze(REQUEST, 'days', { identity: { identity: new Map(), latest: () => learned, inquiring: new Set() } }))
    expect(result.current.universe?.[0]).toMatchObject({ elevation_ft: 6000, osm_id: 'node/1' })
    expect(result.current.pendingHeights.size).toBe(0)
    await act(async () => {
      late.resolve({ rows: [], columns: new Map() })
      await late.promise
    })
    expect(result.current.universe?.[0]).toMatchObject({ elevation_ft: 6000 })
  })

  it('keeps a row waiting that a patch did not place', async () => {
    const { result } = renderHook(() => useAnalyze())
    const late = deferred()
    rankLate(late.promise)
    await analyzeAt(result, T0)
    expect([...result.current.pendingHeights]).toEqual([KEY])
    // The run's own call changed nothing about the row: still waiting on the lookup.
    await act(async () => {
      late.resolve({ rows: [], columns: new Map([[KEY, { weather: { hourly: { time: [] } } }]]) })
      await late.promise
    })
    expect([...result.current.pendingHeights]).toEqual([KEY])
    act(() => result.current.placeHeld([discovered({ ...PROBE, type: 'custom', elevation_ft: 6000, osm_id: 'node/1' })]))
    expect(result.current.pendingHeights.size).toBe(0)
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
    expect(result.current).toMatchObject({ error: null, refusal: null, response: null, universe: null, analyzed: null, failedView: null })
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

// #782: a ring's found destinations show as pending rows from the moment
// discovery answers, and a forecast failure leaves them on screen so Try
// again asks for the forecasts alone.
describe('a ring\'s found field', () => {
  const RING: GeoPolygon = { type: 'Polygon', coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
  const OTHER_RING: GeoPolygon = { type: 'Polygon', coordinates: [[[-121.6, 47.4], [-121.4, 47.4], [-121.4, 47.55], [-121.6, 47.4]]] }
  const RING_REQUEST: AnalyzeRequest = {
    ...REQUEST,
    polygon: RING,
    destination_types: ['peak', 'lake'],
    include_unnamed_peaks: false,
    custom_destinations: [PROBE],
  }
  const FOUND = [
    discovered({ name: 'Found A', latitude: 47.45, longitude: -121.8, osm_id: 'node/10' }),
    discovered({ name: 'Found B', type: 'lake', latitude: 47.5, longitude: -121.75, osm_id: 'way/11' }),
  ]
  // Every fetch in these runs is the ring's one discovery call, since the
  // ranking is a spy.
  function stubDiscovery() {
    const fetch = vi.fn(async () => fakeResponse({ destinations: FOUND, total: FOUND.length }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }
  // A forecast fetch that fails once the field is announced.
  const failForecasts = () => ranked.mockRejectedValueOnce(new Error('Open-Meteo quota reached. Try again later.'))
  // A forecast fetch that stands until the run is cancelled.
  function holdForecasts() {
    ranked.mockImplementationOnce(
      (_r, _c, _s, _e, cb) =>
        new Promise((_, reject) => cb!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    )
  }

  it('shows the field while its forecasts are fetched, and drops it on the commit', async () => {
    stubDiscovery()
    let release!: () => void
    ranked.mockImplementationOnce(async () => {
      await new Promise<void>((r) => (release = r))
      return { response: DATA, universe: ROWS, aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
    const { result } = renderHook(() => useAnalyze())
    let run!: Promise<boolean>
    act(() => {
      run = result.current.analyze(RING_REQUEST)
    })
    await vi.waitFor(() => expect(result.current.pendingField).toEqual(FOUND))
    await act(async () => {
      release()
      await run
    })
    expect(result.current.analysisSeq).toBe(1)
    expect(result.current.pendingField).toBeNull()
  })

  it('keeps the field through a forecast failure, beside the report it put back', async () => {
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    const { response, universe } = result.current
    stubDiscovery()
    failForecasts()
    await act(() => result.current.analyze(RING_REQUEST))
    expect(result.current.error).toMatchObject({ retry: true })
    expect(result.current.pendingField).toEqual(FOUND)
    expect(result.current.response).toBe(response)
    expect(result.current.universe).toBe(universe)
    expect(result.current.analysisSeq).toBe(1)
  })

  it('forecasts the held field without asking the pod again when the next run asks the same question', async () => {
    const fetch = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    failForecasts()
    await act(() => result.current.analyze(RING_REQUEST))
    expect(fetch).toHaveBeenCalledOnce()
    // The kinds in another order, and the toggle spelled out, are the same question.
    await act(() => result.current.analyze({ ...RING_REQUEST, destination_types: ['lake', 'peak'] }))
    expect(fetch).toHaveBeenCalledOnce()
    expect(ranked.mock.calls[1][1]).toEqual(FOUND)
    expect(result.current).toMatchObject({ analysisSeq: 1, response: DATA, error: null, pendingField: null })
  })

  it('discovers again for a changed ring, kind, unnamed-peaks toggle or list', async () => {
    const changed: AnalyzeRequest[] = [
      { ...RING_REQUEST, polygon: OTHER_RING },
      { ...RING_REQUEST, destination_types: ['peak'] },
      { ...RING_REQUEST, include_unnamed_peaks: true },
      { ...RING_REQUEST, custom_destinations: [PROBE, { name: 'More', latitude: 47.2, longitude: -121.3 }] },
    ]
    for (const request of changed) {
      const fetch = stubDiscovery()
      const { result } = renderHook(() => useAnalyze())
      failForecasts()
      await act(() => result.current.analyze(RING_REQUEST))
      await act(() => result.current.analyze(request))
      expect(fetch).toHaveBeenCalledTimes(2)
    }
  })

  it('drops the field on a cancel, so the next run discovers again', async () => {
    const fetch = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    holdForecasts()
    let run!: Promise<boolean>
    act(() => {
      run = result.current.analyze(RING_REQUEST)
    })
    await vi.waitFor(() => expect(result.current.pendingField).toEqual(FOUND))
    await act(async () => {
      result.current.cancel()
      await run
    })
    expect(result.current.pendingField).toBeNull()
    await act(() => result.current.analyze(RING_REQUEST))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('drops a failed run\'s field when Try again is cancelled', async () => {
    stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    failForecasts()
    await act(() => result.current.analyze(RING_REQUEST))
    holdForecasts()
    let run!: Promise<boolean>
    act(() => {
      run = result.current.analyze(RING_REQUEST)
    })
    expect(result.current.pendingField).toEqual(FOUND)
    await act(async () => {
      result.current.cancel()
      await run
    })
    expect(result.current.pendingField).toBeNull()
  })

  it('drops the field on a reset, so the next run discovers again', async () => {
    const fetch = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    failForecasts()
    await act(() => result.current.analyze(RING_REQUEST))
    act(() => result.current.reset())
    expect(result.current.pendingField).toBeNull()
    await act(() => result.current.analyze(RING_REQUEST))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  // #803, D1: the ring's count ahead of Analyze is a field the run forecasts
  // in place of its own discovery, when the run asks the same question.
  it('forecasts the counted field without asking the pod, when the run asks the same question', async () => {
    const fetch = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    const alone = { ...RING_REQUEST, custom_destinations: undefined }
    const counted = {
      found: { candidates: FOUND, totalFound: null, truncated: false },
      key: fieldKey(RING, ['lake', 'peak'], false),
    }
    await act(() => result.current.analyze(alone, 'days', { counted }))
    expect(fetch).not.toHaveBeenCalled()
    expect(ranked.mock.calls[0][1]).toEqual(FOUND)
    expect(result.current.analysisSeq).toBe(1)
  })

  it('discovers for itself when the count answers a different question', async () => {
    const counted = { found: { candidates: FOUND, totalFound: null, truncated: false }, key: fieldKey(RING, ['peak', 'lake'], false) }
    // A list rides along, which the count never asked about.
    const withList = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    await act(() => result.current.analyze(RING_REQUEST, 'days', { counted }))
    expect(withList).toHaveBeenCalledOnce()
    // Another ring.
    await act(() => result.current.analyze({ ...RING_REQUEST, polygon: OTHER_RING, custom_destinations: undefined }, 'days', { counted }))
    expect(withList).toHaveBeenCalledTimes(2)
  })

  // #803, M7: a cleared ring, or no kind left, releases the failed run's field.
  it('drops a failed run\'s field on request, keeping the report it put back', async () => {
    const fetch = stubDiscovery()
    const { result } = renderHook(() => useAnalyze())
    await analyzeAt(result, T0)
    const { response } = result.current
    failForecasts()
    await act(() => result.current.analyze(RING_REQUEST))
    expect(result.current.pendingField).toEqual(FOUND)
    act(() => result.current.dropFound())
    expect(result.current.pendingField).toBeNull()
    expect(result.current.response).toBe(response)
    await act(() => result.current.analyze(RING_REQUEST))
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  // A run with no ring finds nothing: its rows are the reader's list, which
  // is pending as an input already.
  it('holds no field for a run with no polygon', async () => {
    const { result } = renderHook(() => useAnalyze())
    failForecasts()
    await analyzeAt(result, T0)
    expect(result.current.pendingField).toBeNull()
  })
})

describe('the spend and the air quality (#803)', () => {
  it("hands the run the hourly budget and how many models the chart compares", async () => {
    const { result } = renderHook(() => useAnalyze(1500, [], undefined, undefined, 5000))
    await act(() => result.current.analyze(REQUEST, 'days', { compareModels: ['ecmwf_ifs025'] }))
    expect(ranked.mock.calls[0][4]).toMatchObject({ hourlyCalls: 5000, comparedModels: 1 })
    // An archive window fetches no compared model (record 0236).
    vi.setSystemTime(Date.parse('2026-10-30T00:00:00Z'))
    await act(() => result.current.analyze(REQUEST, 'days', { compareModels: ['ecmwf_ifs025'] }))
    expect(ranked.mock.calls[1][4]).toMatchObject({ hourlyCalls: 5000, comparedModels: 0 })
  })

  it('says when the committed field has air quality for some rows and not all', async () => {
    const two = [resultRow({ ...PROBE }), resultRow({ name: 'Other', latitude: 47.3, longitude: -121.4 })]
    const failedOne = new Set([geoKey(47.3, -121.4)])
    const failedBoth = new Set([geoKey(47.3, -121.4), geoKey(PROBE.latitude, PROBE.longitude)])
    const answer = (aqiFailed: Set<string>) =>
      ranked.mockResolvedValueOnce({ response: { ...DATA, results: two }, universe: two, aqiFailed, columns: new Map(), late: null })
    const { result } = renderHook(() => useAnalyze())
    expect(result.current.aqiPartial).toBe(false)
    answer(failedOne)
    await analyzeAt(result, T0)
    expect(result.current.aqiPartial).toBe(true)
    answer(failedBoth)
    await analyzeAt(result, T0 + MIN)
    expect(result.current.aqiPartial).toBe(false)
    answer(failedOne)
    await analyzeAt(result, T0 + 2 * MIN)
    act(() => result.current.reset())
    expect(result.current.aqiPartial).toBe(false)
  })
})
