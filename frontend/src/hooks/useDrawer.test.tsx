import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDrawer } from './useDrawer'

describe('useDrawer', () => {
  // A phone opens on the map with the search field in reach (#696); a
  // desktop keeps its docked panel.
  it('starts open on a desktop and closed on a phone', () => {
    expect(renderHook(() => useDrawer(true)).result.current.sidebarOpen).toBe(true)
    expect(renderHook(() => useDrawer(false)).result.current.sidebarOpen).toBe(false)
  })

  // A window crossing the breakpoint is a resize, not a reason to move it.
  it('reads the width once, at mount', () => {
    const { result, rerender } = renderHook((desktop: boolean) => useDrawer(desktop), { initialProps: false })
    rerender(true)
    expect(result.current.sidebarOpen).toBe(false)
  })

  it('opens and closes on its two callbacks, which keep their identity', () => {
    const { result, rerender } = renderHook(() => useDrawer(false))
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
