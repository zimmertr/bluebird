import { act } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * jsdom has no `matchMedia`: a stand-in the test flips, stubbed as the
 * global, carrying the listener methods a hook subscribes with. One list
 * answers every query, and `media` holds the last one asked. `flip` changes
 * the answer and tells every listener, inside `act`, the way a window crossing
 * a breakpoint or a device turning dark would. Undo it with
 * `vi.unstubAllGlobals()`.
 */
export function mediaList(matches: boolean) {
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
    flip(to: boolean) {
      list.matches = to
      act(() => listeners.forEach((fn) => fn()))
    },
  }
}
