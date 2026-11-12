import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGlacierCells } from './useGlacierCells'
import type { GlacierCheck } from '../utils/glacierCell'
import { geoKey } from '../utils/points'
import { resultRow } from '../testSupport/fixtures'

const BAKER = resultRow({ name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, snow_depth_in: 1290.04 })
const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, snow_depth_in: 210 })
const BARE = resultRow({ name: 'Bare', latitude: 47.5, longitude: -121.5, snow_depth_in: null })

/** A check that answers from a list of glaciated latitudes, held or asked. */
function check(onIce: number[], held: boolean): GlacierCheck & { ask: ReturnType<typeof vi.fn> } {
  const answer = (_lng: number, lat: number) => onIce.includes(lat)
  return {
    now: (lng, lat) => (held ? answer(lng, lat) : undefined),
    ask: vi.fn(async (lng: number, lat: number) => answer(lng, lat)),
  }
}

describe('useGlacierCells', () => {
  it('names the rows on a glacier once the check answers', async () => {
    const glaciers = check([BAKER.latitude], false)
    const { result } = renderHook(() => useGlacierCells([BAKER, ADAMS], true, glaciers))
    await waitFor(() => expect([...result.current]).toEqual([geoKey(BAKER.latitude, BAKER.longitude)]))
    expect(glaciers.ask).toHaveBeenCalledTimes(2)
  })

  // A row with no depth has no cell to mark, so it costs no tile.
  it('asks nothing for a row with no depth', async () => {
    const glaciers = check([], false)
    renderHook(() => useGlacierCells([BARE, ADAMS], true, glaciers))
    await waitFor(() => expect(glaciers.ask).toHaveBeenCalledTimes(1))
    expect(glaciers.ask.mock.calls[0][1]).toBe(ADAMS.latitude)
  })

  it('takes an answer from tiles already held without asking', async () => {
    const glaciers = check([ADAMS.latitude], true)
    const { result } = renderHook(() => useGlacierCells([ADAMS], true, glaciers))
    await waitFor(() => expect(result.current.has(geoKey(ADAMS.latitude, ADAMS.longitude))).toBe(true))
    expect(glaciers.ask).not.toHaveBeenCalled()
  })

  // Hidden column, nothing to decorate.
  it('asks nothing while the column is hidden', () => {
    const glaciers = check([BAKER.latitude], false)
    const { result } = renderHook(() => useGlacierCells([BAKER], false, glaciers))
    expect(result.current.size).toBe(0)
    expect(glaciers.ask).not.toHaveBeenCalled()
  })

  // An answer about one table's rows is never shown beside another's.
  it('drops the answer when the rows change', async () => {
    const glaciers = check([BAKER.latitude], false)
    const { result, rerender } = renderHook(({ rows }) => useGlacierCells(rows, true, glaciers), {
      initialProps: { rows: [BAKER] },
    })
    await waitFor(() => expect(result.current.size).toBe(1))
    rerender({ rows: [ADAMS] })
    expect(result.current.size).toBe(0)
  })

  // A tile that cannot be read answers no glacier, as it does on the card.
  it('reads a failed tile as no glacier', async () => {
    const glaciers: GlacierCheck = { now: () => undefined, ask: vi.fn(async () => Promise.reject(new Error('tile'))) }
    const { result } = renderHook(() => useGlacierCells([BAKER, ADAMS], true, glaciers))
    await waitFor(() => expect(glaciers.ask).toHaveBeenCalledTimes(2))
    expect(result.current.size).toBe(0)
  })
})
