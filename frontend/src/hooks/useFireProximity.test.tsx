import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { MultiPolygon, Polygon } from 'geojson'
import { useFireProximity } from './useFireProximity'
import { fakeResponse } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'

// A 0.2° square fire near (45.6, -121.9), and a box of coverage around it.
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
// About 35 miles north of the square: past the warning distance.
const FAR = { latitude: 46.2, longitude: -121.9 }

const BODY = {
  type: 'FeatureCollection',
  fetched_at: 0,
  coverage: COVERAGE,
  features: [{ type: 'Feature', properties: { attr_IncidentName: 'Probe Fire' }, geometry: SQUARE }],
}

const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useFireProximity', () => {
  it('warns the destination near a fire from one coarse query, and clears the rest', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(BODY))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFireProximity([INSIDE, FAR]))
    await flush()
    expect(result.current.status).toBe('ready')
    const warned = result.current.warnings.get(geoKey(INSIDE.latitude, INSIDE.longitude))
    expect(warned?.name).toBe('Probe Fire')
    expect(warned?.miles).toBe(0)
    expect(result.current.warnings.has(geoKey(FAR.latitude, FAR.longitude))).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('detail=coarse')
  })

  // #642, end to end: the pod's 503 used to hold the column at N/A until the
  // next Analyze. It names its wait, and the check asks again when it is up.
  it('recovers from a pod with nothing to serve once its Retry-After has passed', async () => {
    let calls = 0
    const fetchMock = vi.fn(async () =>
      ++calls === 1
        ? fakeResponse({ detail: 'NIFC is unavailable.' }, 503, { 'Retry-After': '60' })
        : fakeResponse(BODY),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useFireProximity([INSIDE]))
    await flush()
    expect(result.current.status).toBe('unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await flush(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('ready')
    expect(result.current.warnings.size).toBe(1)
  })
})
