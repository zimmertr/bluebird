import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIsDesktop } from './useIsDesktop'

// jsdom has no matchMedia: a list the test flips, carrying the listener
// methods the hook subscribes with.
function mediaList(matches: boolean) {
  const listeners = new Set<() => void>()
  const list = {
    matches,
    media: '',
    addEventListener: vi.fn((_type: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_type: string, fn: () => void) => listeners.delete(fn)),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => Object.assign(list, { media: query })),
  )
  return {
    list,
    listeners,
    cross(to: boolean) {
      list.matches = to
      act(() => listeners.forEach((fn) => fn()))
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsDesktop', () => {
  it('follows the lg breakpoint as the window crosses it, and stops listening on unmount', () => {
    const media = mediaList(true)
    const { result, unmount } = renderHook(() => useIsDesktop())
    expect(media.list.media).toBe('(min-width: 1024px)')
    expect(result.current).toBe(true)
    media.cross(false)
    expect(result.current).toBe(false)
    media.cross(true)
    expect(result.current).toBe(true)
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
