import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMapOverlays } from './useMapOverlays'

// Hoisted: a link's restored state is one object for the session.
const LINK = { showRadar: true, showGrid: true, showPlayer: false }

describe('useMapOverlays', () => {
  it('starts every overlay off, and restores what a link carried', () => {
    const fresh = renderHook(() => useMapOverlays(null, true)).result.current
    expect([fresh.showWildfires, fresh.showRadar, fresh.showSmoke, fresh.showSnow, fresh.showGrid]).toEqual([
      false, false, false, false, false,
    ])
    const linked = renderHook(() => useMapOverlays(LINK, true)).result.current
    expect([linked.showRadar, linked.showGrid, linked.playerShown]).toEqual([true, true, false])
  })

  // Null is the device's default: on at a desktop width, off on a phone. A
  // reader's decision wins either way.
  it('follows the device until the reader decides', () => {
    let desktop = true
    const { result, rerender } = renderHook(() => useMapOverlays(null, desktop))
    expect(result.current.playerShown).toBe(true)
    desktop = false
    rerender()
    expect(result.current.playerShown).toBe(false)
    act(() => result.current.setShowPlayer(true))
    expect(result.current.showPlayer).toBe(true)
    expect(result.current.playerShown).toBe(true)
  })

  it('keeps its setters stable across renders', () => {
    const { result, rerender } = renderHook(() => useMapOverlays(null, true))
    const before = result.current
    rerender()
    expect(result.current.setShowRadar).toBe(before.setShowRadar)
    expect(result.current.setShowPlayer).toBe(before.setShowPlayer)
  })
})
