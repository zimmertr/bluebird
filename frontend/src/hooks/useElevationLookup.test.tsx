import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { CustomDestination } from '../types'
import { useElevationLookup } from './useElevationLookup'
import { LOOKUP_DEBOUNCE_MS, LOOKUP_RETRY_MS } from '../utils/elevationLookup'
import { discovered, fakeResponse } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'

const A: CustomDestination = { name: 'A', latitude: 47.1, longitude: -121.1 }
const B: CustomDestination = { name: 'B', latitude: 47.2, longitude: -121.2 }
const KEY_A = geoKey(A.latitude, A.longitude)
const KEY_B = geoKey(B.latitude, B.longitude)
const NO_PLACES: never[] = []

// What the pod answers: each row sent, placed at 5000 ft or left as sent.
function answer(placed: boolean, complete = true) {
  return (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { custom_destinations: CustomDestination[] }
    const destinations = body.custom_destinations.map((c) =>
      discovered({ ...c, type: 'custom', elevation_ft: placed ? 5000 : null, osm_id: placed ? 'node/1' : null }),
    )
    return fakeResponse({ destinations, total: destinations.length, elevation_lookup_complete: complete })
  }
}
const sent = () => vi.mocked(fetch).mock.calls.map((c) => (JSON.parse((c[1] as RequestInit).body as string) as { custom_destinations: CustomDestination[] }).custom_destinations.map((d) => d.name))

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

describe('useElevationLookup', () => {
  it('asks about the rows once the box has been still, and keeps the answer', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS - 1)
    expect(fetch).not.toHaveBeenCalled()
    await still(1)
    expect(sent()).toEqual([['A', 'B']])
    expect(result.current.identity.get(KEY_A)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
    expect(result.current.identity.get(KEY_B)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
    // Nothing more to ask.
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks about an added row alone, and nothing for a removed one', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result, rerender } = renderHook(({ rows }) => useElevationLookup({ csvRows: rows, places: NO_PLACES, cap: 100 }), {
      initialProps: { rows: [A] },
    })
    await still(LOOKUP_DEBOUNCE_MS)
    rerender({ rows: [A, B] })
    await still(LOOKUP_DEBOUNCE_MS)
    expect(sent()).toEqual([['A'], ['B']])
    rerender({ rows: [B] })
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.current.identity.has(KEY_A)).toBe(true)
  })

  it('waits for an edit mid-flight until the answer lands, then asks about what is still new', async () => {
    let release!: (r: Response) => void
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => new Promise<Response>((r) => (release = r)))
        .mockImplementation(answer(true)),
    )
    const { rerender } = renderHook(({ rows }) => useElevationLookup({ csvRows: rows, places: NO_PLACES, cap: 100 }), {
      initialProps: { rows: [A] },
    })
    await still(LOOKUP_DEBOUNCE_MS)
    rerender({ rows: [A, B] })
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => {
      release(answer(true)('', { body: JSON.stringify({ custom_destinations: [A] }) }) as Response)
    })
    await still(LOOKUP_DEBOUNCE_MS)
    expect(sent()).toEqual([['A'], ['B']])
  })

  it('asks a set the pod gave up on once more after the retry delay, and then leaves it', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, false)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.identity.has(KEY_A)).toBe(false)
    await still(LOOKUP_RETRY_MS - 1)
    expect(fetch).toHaveBeenCalledTimes(1)
    await still(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await still(LOOKUP_RETRY_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps a no-peak answer as an answer when the lookup finished', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(result.current.identity.get(KEY_A)).toEqual({ elevation_ft: null, osm_id: null })
    await still(LOOKUP_RETRY_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('settles only once the lookup in flight has answered, with what it learned', async () => {
    let release!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (release = r))))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    let learned: ReadonlyMap<string, unknown> | null = null
    const settled = result.current.settled().then((m) => (learned = m))
    await still(10)
    expect(learned).toBeNull()
    await act(async () => {
      release(answer(true)('', { body: JSON.stringify({ custom_destinations: [A] }) }) as Response)
      await settled
    })
    expect(learned!.has(KEY_A)).toBe(true)
    // Idle: settles at once.
    await expect(result.current.settled()).resolves.toBe(result.current.identity)
  })

  it('hands the rows it placed to onPlaced, and takes an analysis\'s answer the same way', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const onPlaced = vi.fn()
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100, onPlaced }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(onPlaced).toHaveBeenCalledTimes(1)
    expect(onPlaced.mock.calls[0][0].map((d: { name: string }) => d.name)).toEqual(['A'])
    act(() => result.current.learn([discovered({ ...B, type: 'custom', elevation_ft: 6000, osm_id: 'node/2' })], true))
    expect(result.current.identity.get(KEY_B)).toEqual({ elevation_ft: 6000, osm_id: 'node/2' })
  })

  it('retries, once, the rows an analysis reported the pod gave up on', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, false)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    await still(LOOKUP_RETRY_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
    // The analysis asked too and the pod gave up again: no third ask from here.
    act(() => result.current.learn([discovered({ ...A, type: 'custom', elevation_ft: null, osm_id: null })], false))
    await still(LOOKUP_RETRY_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('asks nothing above the cap, and nothing for an empty box', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 1 }))
    renderHook(() => useElevationLookup({ csvRows: [], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('aborts a lookup in flight on unmount', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined
      return new Promise<Response>(() => {})
    }))
    const { unmount } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
