import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLayerReach } from './useLayerReach'
import type { ViewBounds } from '../utils/layerCoverage'

const bounds = (west: number, south: number, east: number, north: number): ViewBounds => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
})

// Hoisted: the hook re-subscribes when the outlines change identity.
const NO_COVERAGE = {}

// A map whose watcher the test drives by hand.
function fakeMap() {
  let report: ((b: ViewBounds) => void) | null = null
  const unwatch = vi.fn(() => {
    report = null
  })
  const watchBounds = vi.fn((onBounds: (b: ViewBounds) => void) => {
    report = onBounds
    return unwatch
  })
  return { ref: { current: { watchBounds } }, watchBounds, unwatch, move: (b: ViewBounds) => report?.(b) }
}

describe('useLayerReach', () => {
  it('watches the map only while the menu is open, and lets go when it closes', () => {
    const map = fakeMap()
    let active = false
    const { result, rerender } = renderHook(() => useLayerReach(map.ref, NO_COVERAGE, active))
    expect(map.watchBounds).not.toHaveBeenCalled()
    expect(result.current.size).toBe(0)
    active = true
    rerender()
    expect(map.watchBounds).toHaveBeenCalledTimes(1)
    active = false
    rerender()
    expect(map.unwatch).toHaveBeenCalledTimes(1)
  })

  it('answers the view the map reports, and keeps its answer when a move changes no row', () => {
    const map = fakeMap()
    const { result } = renderHook(() => useLayerReach(map.ref, NO_COVERAGE, true))
    act(() => map.move(bounds(6, 45, 12, 48)))
    const alps = result.current
    expect([...alps].sort()).toEqual(['radar', 'smoke', 'snow'])
    act(() => map.move(bounds(7, 45, 13, 48)))
    expect(result.current).toBe(alps)
    act(() => map.move(bounds(-122.5, 46.5, -121, 47.5)))
    expect(result.current.size).toBe(0)
  })

  it('does nothing before the map exists', () => {
    const { result } = renderHook(() => useLayerReach({ current: null }, NO_COVERAGE, true))
    expect(result.current.size).toBe(0)
  })
})
