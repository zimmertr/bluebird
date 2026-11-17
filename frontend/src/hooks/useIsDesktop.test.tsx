import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsDesktop } from './useIsDesktop'
import { mediaList } from '../testSupport/mediaList'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsDesktop', () => {
  it('follows the lg breakpoint as the window crosses it, and stops listening on unmount', () => {
    const media = mediaList(true)
    const { result, unmount } = renderHook(() => useIsDesktop())
    expect(media.list.media).toBe('(min-width: 1024px)')
    expect(result.current).toBe(true)
    media.flip(false)
    expect(result.current).toBe(false)
    media.flip(true)
    expect(result.current).toBe(true)
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
