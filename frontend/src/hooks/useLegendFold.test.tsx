import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { legendExpanded, useLegendFold } from './useLegendFold'
import { readViewPrefs } from '../utils/viewPrefs'

const setViewport = (height: number) => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  window.dispatchEvent(new Event('resize'))
}

describe('useLegendFold', () => {
  const initial = window.innerHeight
  afterEach(() => setViewport(initial))

  // Open wherever the map has room for it under the opening results, on a
  // phone or a desk alike, until the reader presses the header.
  it('follows the room the viewport leaves until the reader answers', () => {
    expect(legendExpanded(null, { viewportH: 844, isDesktop: false })).toBe(true)
    expect(legendExpanded(null, { viewportH: 900, isDesktop: true })).toBe(true)
    expect(legendExpanded(null, { viewportH: 390, isDesktop: false })).toBe(false)
    expect(legendExpanded(null, { viewportH: 600, isDesktop: true })).toBe(false)
    expect(legendExpanded(true, { viewportH: 390, isDesktop: false })).toBe(true)
    expect(legendExpanded(false, { viewportH: 900, isDesktop: true })).toBe(false)
  })

  it('opens a folded legend on a press, and remembers the press', () => {
    setViewport(390)
    const { result } = renderHook(() => useLegendFold(null, false))
    expect(result.current.legendExpanded).toBe(false)
    act(() => result.current.toggleLegend())
    expect(result.current.legendExpanded).toBe(true)
    expect(readViewPrefs().legendOpen).toBe(true)
    act(() => result.current.toggleLegend())
    expect(result.current.legendExpanded).toBe(false)
    expect(readViewPrefs().legendOpen).toBe(false)
  })

  // A rotation recomputes the default while nothing is recorded, and never
  // moves a recorded press.
  it('recomputes the default on a rotation, and only while nothing is recorded', () => {
    setViewport(844)
    const free = renderHook(() => useLegendFold(null, false))
    expect(free.result.current.legendExpanded).toBe(true)
    act(() => setViewport(390))
    expect(free.result.current.legendExpanded).toBe(false)
    const pressed = renderHook(() => useLegendFold(true, false))
    expect(pressed.result.current.legendExpanded).toBe(true)
    act(() => setViewport(844))
    act(() => setViewport(390))
    expect(pressed.result.current.legendExpanded).toBe(true)
  })

  // Nothing is stored until a press: a browser that never pressed keeps
  // following its viewport.
  it('stores nothing on its own, and starts from what was stored', () => {
    renderHook(() => useLegendFold(null, true))
    expect(readViewPrefs().legendOpen).toBeNull()
    const folded = renderHook(() => useLegendFold(false, true))
    expect(folded.result.current.legendExpanded).toBe(false)
  })
})
