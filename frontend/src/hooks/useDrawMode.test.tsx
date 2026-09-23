import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type DrawModeInputs, useDrawMode } from './useDrawMode'
import type { MapViewHandle } from '../components/MapView'
import type { GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}

// The two map calls the mode makes, recorded; the rest of the handle is never
// reached from here.
function mapStub() {
  const map = { framePolygon: vi.fn(), restoreRing: vi.fn() }
  return { map, ref: { current: map as unknown as MapViewHandle } }
}

function inputs(over: Partial<DrawModeInputs> = {}): DrawModeInputs {
  return {
    mapRef: mapStub().ref,
    polygon: null,
    restoredPolygon: undefined,
    isDesktop: true,
    closeDrawer: vi.fn(),
    ...over,
  }
}

const press = (key: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key })))

describe('useDrawMode', () => {
  it('starts out of the mode, with the count a restored ring seeds', () => {
    const fresh = renderHook(() => useDrawMode(inputs()))
    expect(fresh.result.current.drawing).toBe(false)
    expect(fresh.result.current.drawPointCount).toBe(0)
    const restored = renderHook(() => useDrawMode(inputs({ restoredPolygon: RING })))
    expect(restored.result.current.drawPointCount).toBe(3)
  })

  it('frames the ring on the way in, and closes the drawer on a phone only', () => {
    const { map, ref } = mapStub()
    const closeDrawer = vi.fn()
    const desk = renderHook(() => useDrawMode(inputs({ mapRef: ref, closeDrawer })))
    act(() => desk.result.current.startDrawing())
    expect(desk.result.current.drawing).toBe(true)
    expect(map.framePolygon).toHaveBeenCalledTimes(1)
    expect(closeDrawer).not.toHaveBeenCalled()

    const phone = renderHook(() => useDrawMode(inputs({ mapRef: ref, closeDrawer, isDesktop: false })))
    act(() => phone.result.current.startDrawing())
    expect(closeDrawer).toHaveBeenCalledTimes(1)
  })

  // Cancel and Escape put back the ring as it stood when the mode began (#478).
  it('puts the starting ring back on Cancel and on Escape', () => {
    const { map, ref } = mapStub()
    const { result } = renderHook(() => useDrawMode(inputs({ mapRef: ref, polygon: RING })))
    act(() => result.current.startDrawing())
    act(() => result.current.handleCancelDrawing())
    expect(map.restoreRing).toHaveBeenLastCalledWith(RING)
    expect(result.current.drawing).toBe(false)

    act(() => result.current.startDrawing())
    press('Escape')
    expect(map.restoreRing).toHaveBeenCalledTimes(2)
    expect(result.current.drawing).toBe(false)
  })

  it('finishes on Enter only once the ring has three points', () => {
    const { result } = renderHook(() => useDrawMode(inputs()))
    act(() => result.current.startDrawing())
    act(() => result.current.handleDrawUpdate(2))
    press('Enter')
    expect(result.current.drawing).toBe(true)
    act(() => result.current.handleDrawUpdate(3))
    press('Enter')
    expect(result.current.drawing).toBe(false)
  })

  it('leaves Enter and Escape to a field that has the focus', () => {
    const field = document.createElement('textarea')
    document.body.append(field)
    field.focus()
    const { result } = renderHook(() => useDrawMode(inputs()))
    act(() => result.current.startDrawing())
    press('Escape')
    expect(result.current.drawing).toBe(true)
    field.remove()
  })

  it('clears the ring without leaving the mode', () => {
    const { map, ref } = mapStub()
    const { result } = renderHook(() => useDrawMode(inputs({ mapRef: ref })))
    act(() => result.current.startDrawing())
    act(() => result.current.handleClearDrawing())
    expect(map.restoreRing).toHaveBeenLastCalledWith(null)
    expect(result.current.drawing).toBe(true)
  })

  // MapView is memoized, and `handleDrawUpdate` is one of its props.
  it('keeps the update handler stable across renders', () => {
    const { result, rerender } = renderHook(() => useDrawMode(inputs()))
    const before = result.current.handleDrawUpdate
    act(() => result.current.handleDrawUpdate(1))
    rerender()
    expect(result.current.handleDrawUpdate).toBe(before)
  })
})
