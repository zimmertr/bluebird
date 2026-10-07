import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { CustomDestination } from '../types'
import { useElevationLookup } from './useElevationLookup'
import { LOOKUP_DEBOUNCE_MS, LOOKUP_RETRY_MS, type Identity } from '../utils/elevationLookup'
import { lookupPeaks } from '../utils/peakTiles'
import { discovered, fakeResponse } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'

// The tiles are peakTiles.ts's and have their own suite. A spy here says
// which rows they were asked about and places whatever a test says.
vi.mock('../utils/peakTiles', async (actual) => ({
  ...(await actual<typeof import('../utils/peakTiles')>()),
  lookupPeaks: vi.fn(),
  tileTemplate: vi.fn(async () => 'https://tiles.example/{z}/{x}/{y}.pbf'),
}))
const tiles = vi.mocked(lookupPeaks)

const A: CustomDestination = { name: 'A', latitude: 47.1, longitude: -121.1 }
const B: CustomDestination = { name: 'B', latitude: 47.2, longitude: -121.2 }
const KEY_A = geoKey(A.latitude, A.longitude)
const KEY_B = geoKey(B.latitude, B.longitude)
const NO_PLACES: never[] = []

// What the tiles answer: the named rows placed at 7000 ft.
function tilesPlace(...names: string[]) {
  tiles.mockImplementation(async (rows) => {
    const placed = new Map<string, Identity>()
    for (const r of rows) if (names.includes(r.name)) placed.set(geoKey(r.latitude, r.longitude), { elevation_ft: 7000, osm_id: 'node/7' })
    return placed
  })
}
// The rows each tile lookup was asked about.
const tiled = () => tiles.mock.calls.map((c) => c[0].map((r) => r.name))

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
const bodies = () => vi.mocked(fetch).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as { custom_destinations: CustomDestination[]; elevation_lookup?: boolean })
const sent = () => bodies().map((b) => b.custom_destinations.map((d) => d.name))

async function still(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  tiles.mockReset()
  tilesPlace()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useElevationLookup', () => {
  it('asks the tiles once the box has been still, then the pod about what they left, and keeps both answers', async () => {
    tilesPlace('A')
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS - 1)
    expect(tiles).not.toHaveBeenCalled()
    await still(1)
    expect(tiled()).toEqual([['A', 'B']])
    expect(sent()).toEqual([['B']])
    expect(bodies()[0].elevation_lookup).toBe(true)
    expect(result.current.identity.get(KEY_A)).toEqual({ elevation_ft: 7000, osm_id: 'node/7' })
    expect(result.current.identity.get(KEY_B)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
    expect(result.current.inquiring.size).toBe(0)
    // Nothing more to ask.
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(tiles).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('never asks the pod when the tiles placed every row', async () => {
    tilesPlace('A', 'B')
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.identity.size).toBe(2)
  })

  it('asks the pod about every row when the tiles cannot be read', async () => {
    tiles.mockRejectedValue(new Error('chunk failed'))
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(sent()).toEqual([['A']])
    expect(result.current.identity.get(KEY_A)).toEqual({ elevation_ft: 5000, osm_id: 'node/1' })
  })

  it('asks about an added row alone, and nothing for a removed one', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result, rerender } = renderHook(({ rows }) => useElevationLookup({ csvRows: rows, places: NO_PLACES, cap: 100 }), {
      initialProps: { rows: [A] },
    })
    await still(LOOKUP_DEBOUNCE_MS)
    rerender({ rows: [A, B] })
    await still(LOOKUP_DEBOUNCE_MS)
    expect(tiled()).toEqual([['A'], ['B']])
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

  it('asks a set the pod gave up on once more after the retry delay, tiles first, and then leaves it', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, false)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.current.identity.has(KEY_A)).toBe(false)
    // Still being asked about: the cells may tick.
    expect([...result.current.inquiring]).toEqual([KEY_A])
    await still(LOOKUP_RETRY_MS - 1)
    expect(fetch).toHaveBeenCalledTimes(1)
    await still(1)
    expect(tiles).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledTimes(2)
    // Given up on: nothing more is coming for the row.
    expect(result.current.inquiring.size).toBe(0)
    await still(LOOKUP_RETRY_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('asks again about a set it had given up on once the list changes', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, false)))
    const { result, rerender } = renderHook(({ rows }) => useElevationLookup({ csvRows: rows, places: NO_PLACES, cap: 100 }), {
      initialProps: { rows: [A] },
    })
    await still(LOOKUP_DEBOUNCE_MS)
    await still(LOOKUP_RETRY_MS)
    expect(result.current.inquiring.size).toBe(0)
    rerender({ rows: [A, B] })
    expect([...result.current.inquiring].sort()).toEqual([KEY_A, KEY_B].sort())
    await still(LOOKUP_DEBOUNCE_MS)
    expect(sent()).toEqual([['A'], ['A'], ['A', 'B']])
  })

  it('keeps a no-peak answer as an answer when the pod finished', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(false, true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(result.current.identity.get(KEY_A)).toEqual({ elevation_ft: null, osm_id: null })
    expect(result.current.inquiring.size).toBe(0)
    await still(LOOKUP_RETRY_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('reads the latest identities as of the call, not the render', async () => {
    tilesPlace('A')
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const { result } = renderHook(() => useElevationLookup({ csvRows: [A], places: NO_PLACES, cap: 100 }))
    const before = result.current
    await still(LOOKUP_DEBOUNCE_MS)
    expect(before.latest().get(KEY_A)).toEqual({ elevation_ft: 7000, osm_id: 'node/7' })
    expect(before.identity.has(KEY_A)).toBe(false)
  })

  it('hands the rows each source placed to onPlaced, as they land', async () => {
    tilesPlace('A')
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const onPlaced = vi.fn()
    renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 100, onPlaced }))
    await still(LOOKUP_DEBOUNCE_MS)
    expect(onPlaced).toHaveBeenCalledTimes(2)
    expect(onPlaced.mock.calls[0][0]).toEqual([
      { name: 'A', type: 'custom', latitude: A.latitude, longitude: A.longitude, elevation_ft: 7000, osm_id: 'node/7' },
    ])
    expect(onPlaced.mock.calls[1][0].map((d: { name: string }) => d.name)).toEqual(['B'])
  })

  it('asks nothing above the cap, and nothing for an empty box', async () => {
    vi.stubGlobal('fetch', vi.fn(answer(true)))
    const over = renderHook(() => useElevationLookup({ csvRows: [A, B], places: NO_PLACES, cap: 1 }))
    renderHook(() => useElevationLookup({ csvRows: [], places: NO_PLACES, cap: 100 }))
    await still(LOOKUP_DEBOUNCE_MS * 2)
    expect(tiles).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(over.result.current.inquiring.size).toBe(0)
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
