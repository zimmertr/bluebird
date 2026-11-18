import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCardChips } from './useCardChips'

// The map's stack of rows as the hook finds it: the card first in it, and
// the map's own box as its offset parent. jsdom lays nothing out, so the two
// heights are whatever a test sets.
function stage(mapPx: number, cardPx: number) {
  const size = { mapPx, cardPx, topPx: 0 }
  const map = document.createElement('div')
  const stack = document.createElement('div')
  const card = document.createElement('aside')
  stack.append(card)
  map.append(stack)
  Object.defineProperty(stack, 'offsetParent', { get: () => map })
  Object.defineProperty(map, 'clientHeight', { get: () => size.mapPx })
  card.getBoundingClientRect = () => ({ height: size.cardPx }) as DOMRect
  map.getBoundingClientRect = () => ({ top: size.topPx }) as DOMRect
  return { ref: { current: stack }, size, map, card }
}

// A ResizeObserver a test fires by hand, which records what it watches.
function observers() {
  const seen: { fire: () => void; watched: Element[]; disconnected: boolean }[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private entry: (typeof seen)[number]
      constructor(callback: () => void) {
        this.entry = { fire: callback, watched: [], disconnected: false }
        seen.push(this.entry)
      }
      observe(el: Element) {
        this.entry.watched.push(el)
      }
      disconnect() {
        this.entry.disconnected = true
      }
    },
  )
  return seen
}

afterEach(() => vi.unstubAllGlobals())

// Where the chip row stands around a desk's open controls card (#825;
// record 0305; the maintainer, 2026-11-17).
describe('useCardChips', () => {
  it('is nothing while no card is open, and watches nothing', () => {
    const seen = observers()
    const { ref } = stage(594, 335)
    const { result } = renderHook(() => useCardChips(ref, false))
    expect(result.current).toBeNull()
    expect(seen).toHaveLength(0)
  })

  it('reads the card and the map before the first paint: under where the legend has room', () => {
    observers()
    const { ref } = stage(594, 335)
    const { result } = renderHook(() => useCardChips(ref, true))
    // jsdom's window is 768px tall: the menu under the chips has what is
    // left of it under the rows, the gap and one inset.
    expect(result.current).toEqual({ side: 'under', cardPx: 335, menuPx: window.innerHeight - 391 - 4 - 12 })
  })

  it('stands the chips beside the card on a map too short for the legend under it', () => {
    observers()
    const { ref } = stage(380, 335)
    const { result } = renderHook(() => useCardChips(ref, true))
    expect(result.current).toEqual({ side: 'beside' })
  })

  it('follows the card as a section opens and the map as the results take its foot', () => {
    const seen = observers()
    const { ref, size, map, card } = stage(825, 535)
    const { result } = renderHook(() => useCardChips(ref, true))
    expect(seen[0].watched).toEqual([card, map])
    expect(result.current).toMatchObject({ side: 'under', cardPx: 535 })
    // Metrics opens: 723px of an 825px map leaves the legend nothing.
    size.cardPx = 723
    act(() => seen[0].fire())
    expect(result.current).toEqual({ side: 'beside' })
    // A run collapses every section, and the results leave a 594px map.
    size.cardPx = 335
    size.mapPx = 594
    act(() => seen[0].fire())
    expect(result.current).toMatchObject({ side: 'under', cardPx: 335 })
  })

  // A preview's banner, or anything else over the map, takes its height out
  // of the window a menu under the chips may use; so does a shorter window.
  it('bounds a menu under the chips by the window under the map\'s top', () => {
    observers()
    const { ref, size } = stage(594, 335)
    size.topPx = 32
    const { result } = renderHook(() => useCardChips(ref, true))
    expect(result.current).toMatchObject({ menuPx: window.innerHeight - 32 - 391 - 4 - 12 })
    size.topPx = 0
    act(() => window.dispatchEvent(new Event('resize')))
    expect(result.current).toMatchObject({ menuPx: window.innerHeight - 391 - 4 - 12 })
  })

  // A results pane moves the map's foot a pixel a frame: the answer is the
  // same object until the row changes sides, so the rows render once.
  it('keeps its answer while nothing it says has changed', () => {
    const seen = observers()
    const { ref, size } = stage(700, 335)
    const { result } = renderHook(() => useCardChips(ref, true))
    const first = result.current
    size.mapPx = 650
    act(() => seen[0].fire())
    expect(result.current).toBe(first)
  })

  it('stops watching when the card shuts', () => {
    const seen = observers()
    const { ref } = stage(594, 335)
    const { result, rerender } = renderHook((open: boolean) => useCardChips(ref, open), { initialProps: true })
    rerender(false)
    expect(result.current).toBeNull()
    expect(seen[0].disconnected).toBe(true)
  })
})
