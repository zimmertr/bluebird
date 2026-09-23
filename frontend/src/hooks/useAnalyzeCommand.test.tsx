import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type AnalyzeCommandInputs, useAnalyzeCommand } from './useAnalyzeCommand'
import type { MapViewHandle } from '../components/MapView'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { place, resultRow } from '../testSupport/fixtures'
import type { AnalyzeRequest, GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}
const FIELD = [resultRow()]
const NO_KEYS: ReadonlySet<string> = new Set()

// Every call the click makes, in one list, so a test can read their order.
function recorder(over: Partial<AnalyzeCommandInputs> = {}) {
  const calls: string[] = []
  const requests: AnalyzeRequest[] = []
  const scopes: string[] = []
  const waiting: (() => void)[] = []
  const map = { finishDrawing: vi.fn(() => RING) }
  const inputs: AnalyzeCommandInputs = {
    selection: { kind: 'now' },
    polygon: RING,
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
    analyze: (request) => {
      calls.push(request.polygon ? 'analyze:discovery' : 'analyze:custom')
      requests.push(request)
      return new Promise<void>((resolve) => {
        waiting.push(resolve)
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
  return { inputs, calls, requests, scopes, finish: () => act(async () => waiting.splice(0).forEach((resolve) => resolve())) }
}

describe('useAnalyzeCommand', () => {
  // #337: rows arrive while the run is still going, so the area opens first.
  it('ends drawing, clears removals and opens the results before the run returns', async () => {
    const r = recorder()
    const { result } = renderHook(() => useAnalyzeCommand(r.inputs))
    let done: Promise<void> = Promise.resolve()
    act(() => {
      done = result.current.handleAnalyze()
    })
    expect(r.calls).toEqual([
      'finishDrawing',
      'forgetPreClamp',
      'clearRemovals',
      'showResults:true',
      'analyze:discovery',
    ])
    await r.finish()
    await act(() => done)
    expect(r.calls[r.calls.length - 1]).toBe('showResults:true')
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
