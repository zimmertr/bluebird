import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMapSearchFocus } from './useMapSearchFocus'

afterEach(() => vi.unstubAllGlobals())

describe('useMapSearchFocus', () => {
  it('focuses the search box at once on a desktop, leaving the docked panel open', () => {
    const closeDrawer = vi.fn()
    const { result } = renderHook(() => useMapSearchFocus({ isDesktop: true, closeDrawer }))
    const focus = vi.fn()
    result.current.searchBoxRef.current = { focus }
    result.current.focusMapSearch()
    expect(focus).toHaveBeenCalledOnce()
    expect(closeDrawer).not.toHaveBeenCalled()
  })

  // On a phone the drawer covers the map: it closes, and the focus waits a
  // frame for the commit that closes it.
  it('closes the drawer first on a phone, then focuses on the next frame', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    const closeDrawer = vi.fn()
    const { result } = renderHook(() => useMapSearchFocus({ isDesktop: false, closeDrawer }))
    const focus = vi.fn()
    result.current.searchBoxRef.current = { focus }
    result.current.focusMapSearch()
    expect(closeDrawer).toHaveBeenCalledOnce()
    expect(focus).not.toHaveBeenCalled()
    frames.forEach((cb) => cb(0))
    expect(focus).toHaveBeenCalledOnce()
  })
})
