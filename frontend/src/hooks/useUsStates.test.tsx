import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import outlines from '../utils/usStateOutlines.json'
import { fakeResponse } from '../testSupport/fixtures'
import { useUsStates } from './useUsStates'

afterEach(() => {
  vi.unstubAllGlobals()
})

// The loader holds what it fetched for the session, so these run in order:
// nothing is held until the second asks.
describe('useUsStates', () => {
  it('fetches nothing while no crag needs the outlines', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useUsStates(false))
    expect(result.current).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches them when needed and answers them once they land', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(outlines))
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useUsStates(true))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.map((s) => s.name)).toContain('Washington')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
