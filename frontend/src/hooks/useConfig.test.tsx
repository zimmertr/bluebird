import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useConfig } from './useConfig'
import { fakeResponse } from '../testSupport/fixtures'
import { DEFAULT_UPSTREAMS, resetUpstreams, upstreams } from '../utils/upstreams'

const PREVIEW = { enabled: true, pr: '224', commit: 'abc1234' }

afterEach(() => {
  vi.unstubAllGlobals()
  resetUpstreams()
})

describe('useConfig', () => {
  it('takes the hosts and the banner from the answer, then settles', async () => {
    const fetchMock = vi.fn(async () =>
      fakeResponse({
        preview: PREVIEW,
        upstreams: { map_tiles: 'http://localhost:8080/tiles', radar: 'http://localhost:8080/radar' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useConfig())
    expect(result.current.settled).toBe(false)
    expect(result.current.preview.enabled).toBe(false)
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/config')
    expect(result.current.preview).toEqual(PREVIEW)
    expect(upstreams()).toEqual({
      ...DEFAULT_UPSTREAMS,
      mapTiles: 'http://localhost:8080/tiles',
      radar: 'http://localhost:8080/radar',
    })
  })

  // An older pod sends the banner alone: the production hosts stand.
  it('keeps the production hosts when the answer names none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ preview: PREVIEW })))
    const { result } = renderHook(() => useConfig())
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(upstreams()).toEqual(DEFAULT_UPSTREAMS)
  })

  it('settles on the production hosts when the pod cannot answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ detail: 'nope' }, 503)))
    const { result } = renderHook(() => useConfig())
    await waitFor(() => expect(result.current.settled).toBe(true))
    expect(result.current.preview.enabled).toBe(false)
    expect(upstreams()).toBe(DEFAULT_UPSTREAMS)
  })

  it('does not settle when it is unmounted mid-fetch', async () => {
    let seenSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            seenSignal = init?.signal ?? undefined
            seenSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )
    const { result, unmount } = renderHook(() => useConfig())
    await waitFor(() => expect(seenSignal).toBeDefined())
    unmount()
    expect(seenSignal?.aborted).toBe(true)
    expect(result.current.settled).toBe(false)
  })
})
