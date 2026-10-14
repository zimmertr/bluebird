import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { legendExpanded, useLegendFold } from './useLegendFold'
import { readViewPrefs } from '../utils/viewPrefs'

describe('useLegendFold', () => {
  // Open on a desktop, folded on a phone, until the reader presses the strip.
  it('follows the device until the reader answers', () => {
    expect(legendExpanded(null, true)).toBe(true)
    expect(legendExpanded(null, false)).toBe(false)
    expect(legendExpanded(true, false)).toBe(true)
    expect(legendExpanded(false, true)).toBe(false)
  })

  it('opens a phone\'s legend on a press, and remembers the press', () => {
    const { result } = renderHook(() => useLegendFold(null, false))
    expect(result.current.legendExpanded).toBe(false)
    act(() => result.current.toggleLegend())
    expect(result.current.legendExpanded).toBe(true)
    expect(readViewPrefs().legendOpen).toBe(true)
    act(() => result.current.toggleLegend())
    expect(result.current.legendExpanded).toBe(false)
    expect(readViewPrefs().legendOpen).toBe(false)
  })

  // Nothing is stored until a press: a browser that never pressed keeps
  // following its width.
  it('stores nothing on its own, and starts from what was stored', () => {
    renderHook(() => useLegendFold(null, true))
    expect(readViewPrefs().legendOpen).toBeNull()
    const folded = renderHook(() => useLegendFold(false, true))
    expect(folded.result.current.legendExpanded).toBe(false)
  })
})
