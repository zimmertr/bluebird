import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { usePresetLists, type PresetListsInputs } from './usePresetLists'
import { PRESET_LISTS, forgetPresetLists } from '../utils/presetLists'
import { fakeResponse } from '../testSupport/fixtures'

// The ready-made lists the reader added (record 0306): held by id, each
// fetched once, each removed whole, and a link's lists arriving after the
// panel does.

const [FIRST, SECOND] = PRESET_LISTS
const ROWS: Record<string, string> = {
  [FIRST.url]: '46.85,-121.76,Mount Rainier\n48.78,-121.81,Mount Baker',
  [SECOND.url]: '39.12,-106.45,Mount Elbert',
}

function serve(failing: readonly string[] = []) {
  // Matched on the end of the address, whatever base the fetch puts first.
  const of = (url: string) => Object.keys(ROWS).find((key) => String(url).endsWith(key)) ?? ''
  const fetch = vi.fn(async (url: string) =>
    failing.includes(of(url)) ? fakeResponse({ detail: 'Gone.' }, 404) : fakeResponse({ raw: ROWS[of(url)] }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function hook(over: Partial<PresetListsInputs> = {}) {
  const inputs: PresetListsInputs = { initial: [], onArrived: vi.fn(), onFailed: vi.fn(), ...over }
  return { ...renderHook(() => usePresetLists(inputs)), inputs }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetPresetLists()
})

describe('usePresetLists', () => {
  it('holds every list added, in order, and their rows once each has arrived', async () => {
    serve()
    const { result, inputs } = hook()
    act(() => result.current.add(FIRST.id))
    act(() => result.current.add(SECOND.id))
    expect(result.current.ids).toEqual([FIRST.id, SECOND.id])
    await waitFor(() => expect(result.current.arriving).toBe(false))
    expect(result.current.rows.map((row) => row.name)).toEqual(['Mount Rainier', 'Mount Baker', 'Mount Elbert'])
    // Each arrival frames the map on its own rows.
    expect(vi.mocked(inputs.onArrived).mock.calls.map((call) => call[0].length)).toEqual([2, 1])
    expect(inputs.onFailed).toHaveBeenLastCalledWith(false)
  })

  it('adds a list once, and removes it whole', async () => {
    serve()
    const { result } = hook()
    act(() => result.current.add(FIRST.id))
    act(() => result.current.add(FIRST.id))
    expect(result.current.ids).toEqual([FIRST.id])
    await waitFor(() => expect(result.current.rows).toHaveLength(2))
    act(() => result.current.remove(FIRST.id))
    expect(result.current.ids).toEqual([])
    expect(result.current.rows).toEqual([])
  })

  // A list removed and added again comes back from what arrived, with no
  // second fetch and no second frame.
  it('asks once for a list, however often it is added', async () => {
    const fetch = serve()
    const { result, inputs } = hook()
    act(() => result.current.add(FIRST.id))
    await waitFor(() => expect(result.current.arriving).toBe(false))
    act(() => result.current.remove(FIRST.id))
    act(() => result.current.add(FIRST.id))
    expect(result.current.rows).toHaveLength(2)
    expect(fetch).toHaveBeenCalledOnce()
    expect(inputs.onArrived).toHaveBeenCalledOnce()
  })

  // A link names its lists rather than carrying their rows, so the run on
  // open waits while any has not answered. An id this build does not ship
  // never becomes one.
  it('opens on the lists a link named, arriving until each has answered', async () => {
    serve()
    const { result } = hook({ initial: [FIRST.id, 'no-such-list', FIRST.id] })
    expect(result.current.ids).toEqual([FIRST.id])
    expect(result.current.arriving).toBe(true)
    await waitFor(() => expect(result.current.arriving).toBe(false))
    expect(result.current.rows).toHaveLength(2)
  })

  it('drops a list that did not arrive and says so, keeping the others', async () => {
    serve([SECOND.url])
    const { result, inputs } = hook()
    act(() => result.current.add(FIRST.id))
    act(() => result.current.add(SECOND.id))
    await waitFor(() => expect(result.current.ids).toEqual([FIRST.id]))
    expect(inputs.onFailed).toHaveBeenCalledWith(true)
    expect(result.current.arriving).toBe(false)
  })

  // Removed while it was on its way: nothing to frame and nothing to say.
  it('frames nothing for a list removed before it arrived', async () => {
    serve()
    const { result, inputs } = hook()
    act(() => {
      result.current.add(FIRST.id)
    })
    act(() => result.current.remove(FIRST.id))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(inputs.onArrived).not.toHaveBeenCalled()
    expect(result.current.rows).toEqual([])
  })
})
