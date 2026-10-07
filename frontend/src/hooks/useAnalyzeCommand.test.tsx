import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type AnalyzeCommandInputs, useAnalyzeCommand } from './useAnalyzeCommand'
import { useAnalyze } from './useAnalyze'
import type { MapViewHandle } from '../components/MapView'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { runClientAnalysis } from '../utils/clientAnalyze'
import { discoveryChanges, discoveryKeys } from '../utils/present'
import { discovered, elevationLookup, fakeResponse, place, resultRow } from '../testSupport/fixtures'
import type { AnalyzeOptions } from './analyzeTypes'
import type { AnalyzeRequest, DestinationsRequest, DestinationResult, GeoPolygon } from '../types'

// The ranking has its own suite. The tests over the real analysis below answer
// it from the candidates discovery found, so the rows say which ring they came
// from; the tests above them never reach it.
vi.mock('../utils/clientAnalyze', async (actual) => ({
  ...(await actual<typeof import('../utils/clientAnalyze')>()),
  runClientAnalysis: vi.fn(),
}))
const ranked = vi.mocked(runClientAnalysis)

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}
// A second ring, disjoint from the first.
const RING_B: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-120.9, 48.4], [-120.7, 48.4], [-120.7, 48.55], [-120.9, 48.4]]],
}
const FIELD = [resultRow()]
const NO_KEYS: ReadonlySet<string> = new Set()

// Every call the click makes, in one list, so a test can read their order.
function recorder(over: Partial<AnalyzeCommandInputs> = {}) {
  const calls: string[] = []
  const requests: AnalyzeRequest[] = []
  const scopes: string[] = []
  const options: AnalyzeOptions[] = []
  const waiting: ((committed: boolean) => void)[] = []
  const map = { finishDrawing: vi.fn(() => RING) }
  const inputs: AnalyzeCommandInputs = {
    selection: { kind: 'now' },
    polygon: RING,
    identity: elevationLookup(),
    drawPointCount: 3,
    mapRef: { current: map as unknown as MapViewHandle },
    destinationTypes: ['peak'],
    includeUnnamedPeaks: false,
    csvRows: [],
    places: [],
    destinationScope: 'scope',
    forecastModel: 'gfs_seamless',
    comparedModels: [],
    limit: 200,
    sortBy: 'precip_total_in',
    sortDesc: false,
    constraints: NO_CONSTRAINTS,
    universe: FIELD,
    results: FIELD,
    removedKeys: NO_KEYS,
    hasResults: true,
    // A commit runs the click's own bookkeeping before it resolves, the way
    // useAnalyze does; a cancel or a failure resolves false and runs nothing.
    analyze: (request, _kind, opts) => {
      calls.push(request.polygon ? 'analyze:discovery' : 'analyze:custom')
      requests.push(request)
      options.push(opts)
      return new Promise<boolean>((resolve) => {
        waiting.push((committed) => {
          if (committed) opts.onCommit?.()
          resolve(committed)
        })
      })
    },
    reset: () => calls.push('reset'),
    finishDrawing: () => calls.push('finishDrawing'),
    forgetPreClamp: () => calls.push('forgetPreClamp'),
    clearRemovalsForScope: (scope) => {
      calls.push('clearRemovals')
      scopes.push(scope)
    },
    setShowResults: (show) => calls.push(`showResults:${show}`),
    ...over,
  }
  return {
    inputs,
    calls,
    requests,
    scopes,
    options,
    map,
    finish: (committed = true) => act(async () => waiting.splice(0).forEach((settle) => settle(committed))),
  }
}

const branch = (q: AnalyzeRequest) => (q.polygon ? 'discovery' : 'refresh')

describe('useAnalyzeCommand', () => {
  // #337: rows arrive while the run is still going, so the area opens first.
  // #560: the removals describe the report on screen, so they clear when the
  // new one commits and not before.
  it('ends drawing and opens the results before the run returns, and clears removals as it commits', async () => {
    const r = recorder()
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.handleAnalyze()
    })
    expect(r.calls).toEqual(['finishDrawing', 'forgetPreClamp', 'showResults:true', 'analyze:discovery'])
    await r.finish()
    await act(() => done)
    expect(r.calls.slice(4)).toEqual(['clearRemovals', 'showResults:true'])
  })

  // #560, half 1: the record and the removals describe the report on screen,
  // and a run that does not commit leaves the old one there.
  it('records nothing and clears no removals when a run on a new ring does not commit', async () => {
    const r = recorder()
    let inputs = r.inputs
    const { result, rerender } = renderHook(() => useAnalyzeCommand(inputs))
    const first = result.current.handleAnalyze()
    await r.finish()
    await act(() => first)

    r.map.finishDrawing.mockReturnValue(RING_B)
    inputs = { ...r.inputs, polygon: RING_B }
    rerender()
    const stopped = result.current.handleAnalyze()
    await r.finish(false)
    await act(() => stopped)
    expect(r.scopes).toHaveLength(1)

    const again = result.current.handleAnalyze()
    await r.finish()
    await act(() => again)
    expect(r.requests.map(branch)).toEqual(['discovery', 'discovery', 'discovery'])
    expect(r.requests[2].polygon).toEqual(RING_B)
  })

  // A custom-only run clears the record before it starts. When it does not
  // commit, the polygon report it leaves on screen is described again, so the
  // same ring refreshes rather than searching a second time.
  it('puts the record back when a custom-only run does not commit', async () => {
    const r = recorder()
    let inputs = r.inputs
    const { result, rerender } = renderHook(() => useAnalyzeCommand(inputs))
    const steps: [Partial<AnalyzeCommandInputs>, boolean][] = [[{}, true], [{ drawPointCount: 0, places: [place()] }, false], [{}, true]]
    for (const [next, committed] of steps) {
      inputs = { ...r.inputs, ...next }
      rerender()
      const run = result.current.handleAnalyze()
      await r.finish(committed)
      await act(() => run)
    }
    expect(r.requests.map((q) => (q.polygon ? 'discovery' : q.custom_destinations?.[0]?.name === place().label ? 'custom' : 'refresh')))
      .toEqual(['discovery', 'custom', 'refresh'])
  })

  // Try again replays the request with its options, and its commit answers for
  // the click that failed, so the click's bookkeeping rides on the options.
  it('hands the run what its commit changes, for a retry to apply', async () => {
    const r = recorder()
    r.map.finishDrawing.mockReturnValue(RING_B)
    const { result } = renderHook(() => useAnalyzeCommand({ ...r.inputs, polygon: RING_B }))
    const failed = result.current.handleAnalyze()
    await r.finish(false)
    await act(() => failed)
    expect(r.scopes).toEqual([])

    act(() => r.options[0].onCommit?.())
    expect(r.scopes).toHaveLength(1)
    const next = result.current.handleAnalyze()
    await r.finish()
    await act(() => next)
    expect(r.requests.map(branch)).toEqual(['discovery', 'refresh'])
  })

  // A discovery is recorded once it returns, so the next identical click is a
  // weather-only refresh of the field in hand.
  it('refreshes on the second click over the same ring', async () => {
    const r = recorder()
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    const first = result.current.handleAnalyze()
    await r.finish()
    await act(() => first)
    const second = result.current.handleAnalyze()
    await r.finish()
    await act(() => second)
    expect(r.requests.map((q) => (q.polygon ? 'discovery' : 'refresh'))).toEqual(['discovery', 'refresh'])
  })

  // A click made while the first discovery is still running finds no record
  // yet, because the record is written after the run.
  it('does not refresh against a discovery still in flight', async () => {
    const r = recorder()
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    const first = result.current.handleAnalyze()
    const second = result.current.handleAnalyze()
    expect(r.requests.map((q) => Boolean(q.polygon))).toEqual([true, true])
    await r.finish()
    await act(() => Promise.all([first, second]))
  })

  // A custom-only run forgets the polygon, so the ring after it discovers again.
  it('discovers again after a custom-only run', async () => {
    const r = recorder()
    let inputs = r.inputs
    const { result, rerender } = renderHook(() => useAnalyzeCommand(inputs))
    for (const next of [{}, { drawPointCount: 0, places: [place()] }, {}]) {
      inputs = { ...r.inputs, ...next }
      rerender()
      const run = result.current.handleAnalyze()
      await r.finish()
      await act(() => run)
    }
    expect(r.requests.map((q) => (q.polygon ? 'discovery' : 'custom'))).toEqual(['discovery', 'custom', 'discovery'])
  })

  it('stops before any request when the dates are not chosen', async () => {
    const r = recorder({ selection: { kind: 'days', startDate: null, endDate: null } })
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    await act(() => result.current.handleAnalyze())
    expect(r.calls).toEqual(['finishDrawing', 'forgetPreClamp'])
  })

  it('drops the report when there is nothing to rank', async () => {
    const r = recorder({ drawPointCount: 2 })
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    await act(() => result.current.handleAnalyze())
    expect(r.calls).toEqual(['finishDrawing', 'forgetPreClamp', 'clearRemovals', 'reset', 'showResults:true'])
  })

  // Before the map loads there is no handle to snapshot, and the ring the app
  // holds (a restored link's) is the one that goes out. The removal scope is
  // that ring plus the authored inputs.
  it('falls back to the held ring before the map loads, and scopes removals to it', async () => {
    const r = recorder({ mapRef: { current: null }, universe: null, results: [], hasResults: false })
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    const run = result.current.handleAnalyze()
    await r.finish()
    await act(() => run)
    expect(r.requests[0].polygon).toEqual(RING)
    expect(r.scopes).toEqual([JSON.stringify({ ring: RING.coordinates[0], authored: 'scope' })])
  })
})

// #560, over the real useAnalyze: the review's probe, kept. Discovery answers
// each ring with peaks of its own, so a row's name says which ring it came
// from, and the ranking ranks whatever discovery found.
describe('a run that does not commit changes nothing', () => {
  const PEAKS: Record<string, string[]> = { A: ['A one', 'A two', 'A three'], B: ['B one'] }

  // Ring A's peaks, ring B's, or the custom list echoed back (a refresh).
  function stubDiscovery() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as DestinationsRequest
        if (!body.polygon) {
          const echoed = (body.custom_destinations ?? []).map((c) => discovered({ ...c, type: 'custom' }))
          return fakeResponse({ destinations: echoed, total: echoed.length })
        }
        const [lon, lat] = body.polygon.coordinates[0][0]
        const ring = lat === RING.coordinates[0][0][1] ? 'A' : 'B'
        const found = PEAKS[ring].map((name, i) => discovered({ name, latitude: lat + 0.01 * (i + 1), longitude: lon + 0.01 }))
        return fakeResponse({ destinations: found, total: found.length })
      }),
    )
  }

  const rows = (candidates: readonly { name: string; latitude: number; longitude: number }[]) =>
    candidates.map((c) => resultRow({ name: c.name, latitude: c.latitude, longitude: c.longitude }))
  function rankAll() {
    ranked.mockImplementation(async (_req, candidates) => {
      const field = rows(candidates)
      return { response: { results: field, total_queried: field.length, total_matched: field.length, times: [1] }, universe: field, aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
  }
  // The next ranking shows its first row if asked, then stops: on the
  // reader's Cancel, or with a failure of its own. Resolves once it is under
  // way, so a Cancel lands mid-run rather than before the run has begun.
  function stopNext(how: 'cancel' | 'failure', partial: boolean): Promise<void> {
    let underway!: () => void
    const started = new Promise<void>((resolve) => (underway = resolve))
    ranked.mockImplementationOnce(async (_req, candidates, _s, _e, opts) => {
      if (partial) opts!.onPartial!(rows(candidates.slice(0, 1)), [1])
      underway()
      if (how === 'failure') throw new Error('Broken.')
      await new Promise((_, reject) =>
        opts!.signal!.addEventListener('abort', () => reject(new DOMException('stop', 'AbortError'))),
      )
      throw new Error('unreachable')
    })
    return started
  }

  // The app's wiring of the two hooks, as App.tsx does it.
  function mount(clearRemovalsForScope = vi.fn()) {
    const r = recorder({ clearRemovalsForScope })
    let over: Partial<AnalyzeCommandInputs> = {}
    const hook = renderHook(() => {
      const analysis = useAnalyze()
      const command = useAnalyzeCommand({
        ...r.inputs,
        ...over,
        analyze: analysis.analyze,
        universe: analysis.universe,
        results: analysis.response?.results ?? [],
        hasResults: (analysis.response?.results.length ?? 0) > 0,
      })
      return { analysis, command }
    })
    // A click, and for a Cancel the press once the run is under way.
    const click = async (cancelOnce?: Promise<void>) => {
      let done!: Promise<void>
      act(() => {
        done = hook.result.current.command.handleAnalyze()
      })
      if (cancelOnce) {
        await act(async () => {
          await cancelOnce
          hook.result.current.analysis.cancel()
        })
      }
      await act(() => done)
    }
    const moveTo = (ring: GeoPolygon) => {
      r.map.finishDrawing.mockReturnValue(ring)
      over = { polygon: ring }
      hook.rerender()
    }
    const names = () => hook.result.current.analysis.response?.results.map((row: DestinationResult) => row.name)
    return { hook, click, moveTo, names, clearRemovalsForScope }
  }

  afterEach(() => {
    ranked.mockReset()
    vi.unstubAllGlobals()
  })

  // Half 1: before the fix, the stopped click recorded ring B as searched, so
  // the next one refreshed ring A's field under ring B's name.
  it.each(['cancel', 'failure'] as const)(
    'searches the new ring on the next Analyze after a %s, and keeps the cue and the removals until then',
    async (how) => {
      stubDiscovery()
      rankAll()
      const { hook, click, moveTo, names, clearRemovalsForScope } = mount()
      await click()
      expect(names()).toEqual(PEAKS.A)
      expect(clearRemovalsForScope).toHaveBeenCalledOnce()

      moveTo(RING_B)
      const started = stopNext(how, false)
      await click(how === 'cancel' ? started : undefined)
      expect(names()).toEqual(PEAKS.A)
      // Nothing new was on screen, so the popups over ring A stay open.
      expect(hook.result.current.analysis.discardSeq).toBe(0)
      const cue = discoveryChanges(hook.result.current.analysis.analyzed, discoveryKeys(RING_B, ['peak'], false), true)
      expect(cue.polygon).toBe(true)
      expect(clearRemovalsForScope).toHaveBeenCalledOnce()

      await click()
      expect(names()).toEqual(PEAKS.B)
      expect(clearRemovalsForScope).toHaveBeenCalledTimes(2)
    },
  )

  // Half 2: the partial rows went, and the report before them came back, so
  // the next Analyze echoes the whole field rather than the row that arrived.
  it.each(['cancel', 'failure'] as const)(
    'puts the last report back after a %s that showed partial rows, and refreshes all of it next',
    async (how) => {
      stubDiscovery()
      rankAll()
      const { hook, click, names } = mount()
      await click()
      const before = hook.result.current.analysis
      expect(names()).toEqual(PEAKS.A)

      const started = stopNext(how, true)
      await click(how === 'cancel' ? started : undefined)
      const after = hook.result.current.analysis
      expect(after.response).toBe(before.response)
      expect(after.universe).toBe(before.universe)
      expect(after.analyzed).toBe(before.analyzed)
      expect(after).toMatchObject({ arriving: false, analysisSeq: 1, discardSeq: 1 })

      await click()
      const echo = ranked.mock.calls[ranked.mock.calls.length - 1][1]
      expect(echo.map((c) => c.name)).toEqual(PEAKS.A)
      expect(names()).toEqual(PEAKS.A)
    },
  )

  it.each(['cancel', 'failure'] as const)('returns to no report after a first run whose %s followed partial rows', async (how) => {
    stubDiscovery()
    rankAll()
    const { hook, click } = mount()
    const started = stopNext(how, true)
    await click(how === 'cancel' ? started : undefined)
    expect(hook.result.current.analysis).toMatchObject({ response: null, universe: null, analyzed: null, arriving: false, analysisSeq: 0 })
  })
})
