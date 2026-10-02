import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { MultiPolygon, Polygon } from 'geojson'
import { useClosureProximity } from './useClosureProximity'
import { closureFeature, fakeResponse } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'

// A 0.2° square closure near (45.6, -121.9).
const SQUARE: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-122.0, 45.5],
      [-121.8, 45.5],
      [-121.8, 45.7],
      [-122.0, 45.7],
      [-122.0, 45.5],
    ],
  ],
}
// Oregon and Washington, near enough: a box the three points below sit in.
const COVERAGE: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [-125, 42],
        [-116, 42],
        [-116, 49],
        [-125, 49],
        [-125, 42],
      ],
    ],
  ],
}
const INSIDE = { latitude: 45.6, longitude: -121.9 }
const OUTSIDE = { latitude: 46.2, longitude: -121.5 }
// Mount Robson, in British Columbia: outside the coverage.
const ROBSON = { latitude: 53.1106, longitude: -119.2317 }

const body = (coverage: MultiPolygon | undefined = COVERAGE) => ({
  type: 'FeatureCollection',
  fetched_at: 0,
  coverage,
  features: [closureFeature({}, SQUARE)],
})

let fetchMock: ReturnType<typeof vi.fn>
function answer(respond: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  fetchMock = vi.fn(respond)
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useClosureProximity', () => {
  it('names the closure a destination stands inside, and clears the rest', async () => {
    answer(() => fakeResponse(body()))
    const { result } = renderHook(() => useClosureProximity([INSIDE, OUTSIDE]))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.warnings.get(geoKey(INSIDE.latitude, INSIDE.longitude))?.name).toBe(
      'Probe Fire Closure',
    )
    expect(result.current.warnings.has(geoKey(OUTSIDE.latitude, OUTSIDE.longitude))).toBe(false)
    expect(result.current.uncovered.size).toBe(0)
    // One area query over the coarse copy, whatever the field's size.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('kind=area')
    expect(url).toContain('detail=coarse')
  })

  it('marks a destination outside the published coverage as uncovered', async () => {
    answer(() => fakeResponse(body()))
    const { result } = renderHook(() => useClosureProximity([INSIDE, ROBSON]))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect([...result.current.uncovered]).toEqual([geoKey(ROBSON.latitude, ROBSON.longitude)])
    expect(result.current.warnings.size).toBe(1)
  })

  // The box above is Region 6 alone, which is what the outline is when both
  // other regions' feeds failed: the hover must not name their states (#567).
  it('names in its N/A hover only the states the published outline holds', async () => {
    answer(() => fakeResponse(body()))
    const { result } = renderHook(() => useClosureProximity([INSIDE, ROBSON]))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.uncoveredNote).toBe('Forest Service closure data is only available in Oregon and Washington')
  })

  it('stops at once on a refusal the backoff would not outlast', async () => {
    answer(() => fakeResponse({ detail: 'Slow down.' }, 429))
    const { result } = renderHook(() => useClosureProximity([INSIDE]))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries twice, backing off, and then reports the check unavailable', async () => {
    vi.useFakeTimers()
    answer(() => fakeResponse({ detail: 'Broken.' }, 500))
    const { result } = renderHook(() => useClosureProximity([INSIDE]))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('loading')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('unavailable')
    expect(result.current.warnings.size).toBe(0)
  })

  it('aborts the request in flight when the field changes', async () => {
    const signals: AbortSignal[] = []
    answer((_url, init) => {
      signals.push(init!.signal!)
      return signals.length === 1 ? new Promise<Response>(() => {}) : fakeResponse(body())
    })
    const { result, rerender } = renderHook((field) => useClosureProximity(field), {
      initialProps: [INSIDE],
    })
    await waitFor(() => expect(signals).toHaveLength(1))
    rerender([OUTSIDE])
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(signals[0].aborted).toBe(true)
    expect(result.current.warnings.size).toBe(0)
  })

  it('does not ask again for the same destinations in a new array', async () => {
    answer(() => fakeResponse(body()))
    const { result, rerender } = renderHook((field) => useClosureProximity(field), {
      initialProps: [INSIDE, OUTSIDE],
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender([OUTSIDE, INSIDE])
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again for the same destinations when the analysis sequence moves', async () => {
    answer(() => fakeResponse(body()))
    const { result, rerender } = renderHook(({ seq }) => useClosureProximity([INSIDE], seq), {
      initialProps: { seq: 1 },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ seq: 2 })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('stays idle with nothing to check', () => {
    answer(() => fakeResponse(body()))
    const { result } = renderHook(() => useClosureProximity([]))
    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
