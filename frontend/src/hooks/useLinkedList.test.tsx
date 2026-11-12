import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useLinkedList } from './useLinkedList'
import { parseCustomCsv } from '../utils/customDestinations'
import { PRESET_LISTS, forgetPresetLists, presetListIn } from '../utils/presetLists'
import { fakeResponse } from '../testSupport/fixtures'

// A ready-made list a share link names (`list=`, #864): its rows are not in
// the link, so they arrive after the page opens. What the link's row reads
// and writes is `urlParams.test.ts`.
const LIST = PRESET_LISTS[0]
const ROWS = '46.85,-121.76,Mount Rainier\n46.2,-121.49,Mount Adams'

// The hook beside the box it fills, as `App` holds the two.
function setup(id: string | null, box = '') {
  const onArrived = vi.fn()
  const onFailed = vi.fn()
  const hook = renderHook(() => {
    const [customCsv, setCustomCsv] = useState(box)
    return { customCsv, setCustomCsv, ...useLinkedList({ id, customCsv, setCustomCsv, onArrived, onFailed }) }
  })
  return { ...hook, onArrived, onFailed }
}

// A fetch the test answers when it chooses, so the moment before the list
// lands can be read.
function heldFetch() {
  let resolve: (res: Response) => void = () => {}
  const fetch = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
  vi.stubGlobal('fetch', fetch)
  return async (res: Response) => {
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await act(async () => resolve(res))
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  forgetPresetLists()
})

describe('useLinkedList', () => {
  it('asks for nothing and awaits nothing when the link names no list', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { result } = setup(null)
    expect(result.current).toMatchObject({ awaited: null, arriving: false, customCsv: '' })
    expect(fetch).not.toHaveBeenCalled()
  })

  // The address bar keeps naming the list while the box is still empty, and a
  // link's run on open waits.
  it('awaits the list until its rows are in the box, then frames the map on them', async () => {
    const answer = heldFetch()
    const { result, onArrived, onFailed } = setup(LIST.id)
    expect(result.current).toMatchObject({ awaited: LIST.id, arriving: true, customCsv: '' })
    await answer(fakeResponse({ raw: `${ROWS}\n` }))
    await waitFor(() => expect(result.current.arriving).toBe(false))
    expect(result.current).toMatchObject({ awaited: null, customCsv: ROWS })
    // The box holds the list as a picked one, so the field reads its name and
    // the link goes on naming it.
    expect(presetListIn(result.current.customCsv)).toBe(LIST)
    expect(onArrived).toHaveBeenCalledExactlyOnceWith(parseCustomCsv(ROWS))
    expect(parseCustomCsv(ROWS)).toHaveLength(2)
    expect(onFailed).not.toHaveBeenCalled()
  })

  // A reload asks again, so the link keeps the name of a list that did not
  // arrive, and the panel says it could not load.
  it('says a list that did not arrive failed, and goes on naming it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const answer = heldFetch()
    const { result, onArrived, onFailed } = setup(LIST.id)
    await answer(fakeResponse({ raw: 'gone' }, 404))
    await waitFor(() => expect(result.current.arriving).toBe(false))
    expect(result.current).toMatchObject({ awaited: LIST.id, customCsv: '' })
    expect(onFailed).toHaveBeenCalledExactlyOnceWith(true)
    expect(onArrived).not.toHaveBeenCalled()
    vi.mocked(console.warn).mockRestore()
  })

  // Rows typed before the list landed are the reader's: the list does not
  // replace them, and the link stops naming it.
  it("keeps rows of the reader's own typed while the list was on its way", async () => {
    const answer = heldFetch()
    const { result, onArrived } = setup(LIST.id)
    act(() => result.current.setCustomCsv('47.1,-121.1,Mine'))
    expect(result.current.awaited).toBeNull()
    await answer(fakeResponse({ raw: ROWS }))
    await waitFor(() => expect(result.current.arriving).toBe(false))
    expect(result.current.customCsv).toBe('47.1,-121.1,Mine')
    expect(onArrived).not.toHaveBeenCalled()
  })

  // The decoder drops an id this build does not ship, so this is a guard.
  it('awaits nothing for an id no list answers to', () => {
    vi.stubGlobal('fetch', vi.fn())
    const { result } = setup('no-such-list')
    expect(result.current).toMatchObject({ awaited: null, arriving: false })
  })
})
