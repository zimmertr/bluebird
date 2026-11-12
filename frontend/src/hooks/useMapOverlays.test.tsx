import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMapOverlays } from './useMapOverlays'
import { DEFAULT_BASE_OPACITY } from '../utils/baseMapOpacity'
import { VIEW_KEY, readViewPrefs } from '../utils/viewPrefs'

// Hoisted: a link's restored state is one object for the session.
const LINK = {
  showRadar: true,
  showGrid: true,
  showTrailClosures: true,
  showRelief: true,
  showTerrain: true,
  showFireActivity: true,
  showSlope: true,
}
// A browser that kept nothing, and one that kept both habits.
const NOTHING = { showPlayer: null, baseOpacity: null }
const KEPT = { showPlayer: false, baseOpacity: { ...DEFAULT_BASE_OPACITY, slope: 70 } }

afterEach(() => {
  localStorage.clear()
})

describe('useMapOverlays', () => {
  it('starts every overlay off', () => {
    const fresh = renderHook(() => useMapOverlays(null, true, NOTHING)).result.current
    expect([
      fresh.showWildfires,
      fresh.showAreaClosures,
      fresh.showTrailClosures,
      fresh.showRadar,
      fresh.showSmoke,
      fresh.showSnow,
      fresh.showGrid,
      fresh.showContours,
      fresh.showRelief,
      fresh.showSatellite,
      fresh.showTerrain,
      fresh.showFireActivity,
      fresh.showSlope,
    ]).toEqual([false, false, false, false, false, false, false, false, false, false, false, false, false])
  })

  it('restores what a link carried', () => {
    const linked = renderHook(() => useMapOverlays(LINK, true, NOTHING)).result.current
    expect([linked.showRadar, linked.showGrid]).toEqual([true, true])
    expect([linked.showAreaClosures, linked.showTrailClosures]).toEqual([false, true])
    expect(linked.showFireActivity).toBe(true)
    expect(linked.showSlope).toBe(true)
    expect([linked.showContours, linked.showRelief, linked.showSatellite, linked.showTerrain]).toEqual([
      false,
      true,
      false,
      true,
    ])
  })

  // Null is the device's default: on at a desktop width, off on a phone. A
  // reader's decision wins either way.
  it('follows the device until the reader decides', () => {
    let desktop = true
    const { result, rerender } = renderHook(() => useMapOverlays(null, desktop, NOTHING))
    expect(result.current.playerShown).toBe(true)
    desktop = false
    rerender()
    expect(result.current.playerShown).toBe(false)
    act(() => result.current.setShowPlayer(true))
    expect(result.current.showPlayer).toBe(true)
    expect(result.current.playerShown).toBe(true)
  })

  // The player's switch and the opacity levels are this browser's habits
  // (#864): a link carries neither, and the browser's storage holds both.
  it('opens the player and the opacity levels on what this browser kept, whatever the link says', () => {
    const opened = renderHook(() => useMapOverlays(LINK, true, KEPT)).result.current
    expect(opened.playerShown).toBe(false)
    expect(opened.baseOpacity).toEqual({ ...DEFAULT_BASE_OPACITY, slope: 70 })
    const fresh = renderHook(() => useMapOverlays(LINK, true, NOTHING)).result.current
    expect(fresh.showPlayer).toBeNull()
    expect(fresh.baseOpacity).toEqual(DEFAULT_BASE_OPACITY)
  })

  it('keeps a decision about the player and a moved level in this browser', () => {
    const { result } = renderHook(() => useMapOverlays(null, true, NOTHING))
    // Nothing decided is nothing kept: the device's default and the sliders'
    // start are not answers.
    expect(localStorage.getItem(VIEW_KEY)).toBe('{}')
    act(() => result.current.setShowPlayer(false))
    act(() => result.current.setBaseOpacity('satellite', 80))
    expect(readViewPrefs()).toMatchObject({
      showPlayer: false,
      baseOpacity: { ...DEFAULT_BASE_OPACITY, satellite: 80 },
    })
    // A level put back where it starts is no answer again.
    act(() => result.current.setBaseOpacity('satellite', DEFAULT_BASE_OPACITY.satellite))
    expect(readViewPrefs().baseOpacity).toBeNull()
    expect(readViewPrefs().showPlayer).toBe(false)
  })

  it('keeps its setters stable across renders', () => {
    const { result, rerender } = renderHook(() => useMapOverlays(null, true, NOTHING))
    const before = result.current
    rerender()
    expect(result.current.setShowRadar).toBe(before.setShowRadar)
    expect(result.current.setShowPlayer).toBe(before.setShowPlayer)
    expect(result.current.setShowTerrain).toBe(before.setShowTerrain)
    expect(result.current.setBaseOpacity).toBe(before.setBaseOpacity)
  })
})
