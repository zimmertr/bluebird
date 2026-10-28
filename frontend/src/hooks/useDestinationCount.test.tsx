import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { DiscoveryType, GeoPolygon } from '../types'
import { useDestinationCount } from './useDestinationCount'
import { COUNT_DEBOUNCE_MS, COUNT_SPACING_MS, fieldKey } from '../utils/destinationCount'
import { discovered, fakeResponse } from '../testSupport/fixtures'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}
const OTHER: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.6, 47.4], [-121.6, 47.6], [-121.9, 47.4]]],
}
const FIVE = Array.from({ length: 5 }, (_, i) => discovered({ name: `P${i}`, latitude: 47.45 + i * 0.01 }))
const FIELD = () => fakeResponse({ destinations: FIVE, total: 5, total_found: null, truncated: false })
const OVER = () =>
  fakeResponse(
    {
      detail: 'This search covers 2,613 destinations. The analysis limit is 1,500 destinations.',
      error: { code: 'refusal', retryable: false },
      found: 2613,
      limit: 1500,
    },
    400,
  )

type Props = Parameters<typeof useDestinationCount>[0]
const PEAKS: DiscoveryType[] = ['peak']
function props(over: Partial<Props> = {}): Props {
  return {
    polygon: RING,
    drawPointCount: 3,
    drawing: false,
    polygonAreaKm2: 10,
    maxAreaKm2: 100_000,
    destinationTypes: PEAKS,
    includeUnnamedPeaks: false,
    discoverySource: 'places',
    ...over,
  }
}
const mount = (initial: Props = props()) =>
  renderHook((p: Props) => useDestinationCount(p), { initialProps: initial })

const bodies = () =>
  vi.mocked(fetch).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as Record<string, unknown>)

async function still(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useDestinationCount', () => {
  it('counts the ring once it has been still, for the ring alone, and hands the field over', async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const { result } = mount()
    await still(COUNT_DEBOUNCE_MS - 1)
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.ringCount).toBeNull()
    await still(1)
    expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toEqual(['/api/destinations'])
    expect(bodies()[0]).toEqual({
      polygon: RING,
      destination_types: ['peak'],
      include_unnamed_peaks: false,
      top_by_elevation: false,
      elevation_lookup: false,
    })
    expect(result.current.ringCount).toBe(5)
    expect(result.current.counted()).toEqual({
      found: { candidates: FIVE, totalFound: null, truncated: false },
      key: fieldKey(RING, PEAKS, false),
    })
  })

  // Overpass is donated: a count there would spend it on a ring the reader
  // may never analyze.
  it('never asks anything where discovery answers from Overpass', async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const { result, rerender } = mount(props({ discoverySource: 'overpass' }))
    await still(COUNT_DEBOUNCE_MS * 4)
    rerender(props({ discoverySource: 'overpass', polygon: OTHER }))
    await still(COUNT_DEBOUNCE_MS * 4)
    rerender(props({ discoverySource: 'overpass', destinationTypes: ['peak', 'lake'] }))
    await still(COUNT_DEBOUNCE_MS * 4)
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.ringCount).toBeNull()
    expect(result.current.counted()).toBeNull()
  })

  it("reads the pod's over-cap refusal as a count with no field", async () => {
    vi.stubGlobal('fetch', vi.fn(OVER))
    const { result } = mount(props({ includeUnnamedPeaks: true }))
    await still(COUNT_DEBOUNCE_MS)
    expect(result.current.ringCount).toBe(2613)
    expect(result.current.counted()).toBeNull()
  })

  it('stays silent on any other answer, and does not ask again for the same ring', async () => {
    vi.stubGlobal('fetch', vi.fn(() => fakeResponse({ detail: 'Too many requests from this connection.' }, 429)))
    const { result, rerender } = mount()
    await still(COUNT_DEBOUNCE_MS)
    expect(result.current.ringCount).toBeNull()
    rerender(props())
    await still(COUNT_DEBOUNCE_MS * 4)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('waits for an unfinished, oversized or empty search, and for the drawing to end', async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const { rerender } = mount(props({ drawing: true }))
    await still(COUNT_DEBOUNCE_MS * 2)
    rerender(props({ drawPointCount: 2 }))
    await still(COUNT_DEBOUNCE_MS * 2)
    rerender(props({ polygonAreaKm2: 200_000 }))
    await still(COUNT_DEBOUNCE_MS * 2)
    rerender(props({ destinationTypes: [] }))
    await still(COUNT_DEBOUNCE_MS * 2)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborts a count in flight when the ring moves, and counts the ring that stands', async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signals.push(init.signal!)
        return signals.length === 1 ? new Promise<Response>(() => {}) : Promise.resolve(FIELD())
      }),
    )
    const { result, rerender } = mount()
    await still(COUNT_DEBOUNCE_MS)
    expect(signals).toHaveLength(1)
    rerender(props({ polygon: OTHER }))
    expect(signals[0].aborted).toBe(true)
    await still(COUNT_SPACING_MS)
    expect(signals).toHaveLength(2)
    expect((bodies()[1] as { polygon: GeoPolygon }).polygon).toEqual(OTHER)
    expect(result.current.ringCount).toBe(5)
    expect(result.current.counted()?.key).toBe(fieldKey(OTHER, PEAKS, false))
  })

  // A vertex dragged for a while is one settled edit: nothing goes until the
  // ring has been still, and two counts are never closer than the bucket
  // refills (30 a minute).
  it('sends one count for a burst of edits, and spaces counts by the bucket', async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const rings = Array.from({ length: 20 }, (_, i) => ({
      ...RING,
      coordinates: [[[-121.9, 47.4], [-121.7 + i * 0.001, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
    }))
    const { rerender } = mount(props({ polygon: rings[0] }))
    for (const ring of rings) {
      rerender(props({ polygon: ring }))
      await still(100)
    }
    expect(fetch).not.toHaveBeenCalled()
    await still(COUNT_DEBOUNCE_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    rerender(props({ polygon: OTHER }))
    await still(COUNT_DEBOUNCE_MS)
    // Under the spacing since the last count: still waiting.
    expect(fetch).toHaveBeenCalledTimes(1)
    await still(COUNT_SPACING_MS - COUNT_DEBOUNCE_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('answers a ring it has counted from what it kept', async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const { result, rerender } = mount()
    await still(COUNT_DEBOUNCE_MS)
    rerender(props({ includeUnnamedPeaks: true }))
    await still(COUNT_SPACING_MS)
    rerender(props())
    await still(COUNT_SPACING_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.current.ringCount).toBe(5)
  })

  it("forgets the count while the panel no longer describes that ring", async () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const { result, rerender } = mount()
    await still(COUNT_DEBOUNCE_MS)
    rerender(props({ destinationTypes: ['lake'] }))
    expect(result.current.ringCount).toBeNull()
    expect(result.current.counted()).toBeNull()
  })

  // #803, M7: a failed run's found field goes with the ring that found it.
  it('says when the ring is cleared or every kind unticked', () => {
    vi.stubGlobal('fetch', vi.fn(FIELD))
    const onRingGone = vi.fn()
    const { rerender } = mount(props({ onRingGone }))
    expect(onRingGone).not.toHaveBeenCalled()
    rerender(props({ onRingGone, destinationTypes: [] }))
    expect(onRingGone).toHaveBeenCalledTimes(1)
    rerender(props({ onRingGone }))
    rerender(props({ onRingGone, polygon: null, drawPointCount: 0 }))
    expect(onRingGone).toHaveBeenCalledTimes(2)
  })
})
