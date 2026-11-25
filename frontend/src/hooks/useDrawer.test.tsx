import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDrawer } from './useDrawer'

describe('useDrawer', () => {
  // A phone opens on the map with the search field in reach (#696), and a
  // desk on the map under the sentence bar (record 0334).
  it('starts shut', () => {
    expect(renderHook(() => useDrawer()).result.current.sidebarOpen).toBe(false)
  })

  it('opens and closes on its two callbacks, which keep their identity', () => {
    const { result, rerender } = renderHook(() => useDrawer())
    const { openDrawer, closeDrawer } = result.current
    act(() => openDrawer())
    expect(result.current.sidebarOpen).toBe(true)
    act(() => closeDrawer())
    expect(result.current.sidebarOpen).toBe(false)
    rerender()
    expect(result.current.openDrawer).toBe(openDrawer)
    expect(result.current.closeDrawer).toBe(closeDrawer)
  })
})
