import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type DrawModeInputs, useDrawMode } from './useDrawMode'
import type { MapViewHandle } from '../components/MapView'
import type { GeoPolygon } from '../types'
import { MAX_AREAS } from '../utils/drawGeometry'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}
const OTHER: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-120.9, 48.4], [-120.7, 48.4], [-120.7, 48.55], [-120.9, 48.4]]],
}

// The map calls the mode makes, recorded, with the ring the map would hand
// back at Done (null for one under three points).
function mapStub(ring: GeoPolygon | null = RING) {
  const map = { framePolygon: vi.fn(), restoreRing: vi.fn(), finishDrawing: vi.fn(() => ring) }
  return { map, ref: { current: map as unknown as MapViewHandle } }
}

// The hook over areas held the way `useDestinationInputs` holds them, so a
// test reads what Done and × leave behind.
function mount(over: Partial<Omit<DrawModeInputs, 'areas' | 'setAreas'>> = {}, initial: GeoPolygon[] = []) {
  const closeDrawer = vi.fn()
  const fallback = mapStub().ref
  const hook = renderHook(() => {
    const [areas, setAreas] = useState<GeoPolygon[]>(initial)
    const mode = useDrawMode({ mapRef: fallback, isDesktop: true, closeDrawer, ...over, areas, setAreas })
    return { areas, mode }
  })
  return { ...hook, closeDrawer }
}

const press = (key: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key })))

describe('useDrawMode', () => {
  // Every session starts out of the mode, a link with areas in it too
  // (#119): the common case is looking at the map.
  it('starts out of the mode, with no points', () => {
    const { result } = mount({}, [RING])
    expect(result.current.mode.drawing).toBe(false)
    expect(result.current.mode.editing).toBeNull()
    expect(result.current.mode.drawPointCount).toBe(0)
  })

  it('starts a new area on an empty ring, and closes the drawer on a phone only', () => {
    const { map, ref } = mapStub()
    const desk = mount({ mapRef: ref })
    act(() => desk.result.current.mode.startArea())
    expect(desk.result.current.mode.drawing).toBe(true)
    expect(desk.result.current.mode.editing).toBeNull()
    expect(map.restoreRing).toHaveBeenLastCalledWith(null)
    expect(desk.closeDrawer).not.toHaveBeenCalled()

    const phone = mount({ mapRef: ref, isDesktop: false })
    act(() => phone.result.current.mode.startArea())
    expect(phone.closeDrawer).toHaveBeenCalledTimes(1)
  })

  it('adds the ring as a new area at Done, and leaves the mode', () => {
    const { ref } = mapStub(OTHER)
    const { result } = mount({ mapRef: ref }, [RING])
    act(() => result.current.mode.startArea())
    let answered: GeoPolygon[] = []
    act(() => {
      answered = result.current.mode.finishDrawing()
    })
    expect(result.current.areas).toEqual([RING, OTHER])
    expect(answered).toEqual([RING, OTHER])
    expect(result.current.mode.drawing).toBe(false)
  })

  // An area's chip: its ring, framed, and Done puts the edit in its place.
  it('edits an area in place from its chip', () => {
    const { map, ref } = mapStub(OTHER)
    const { result } = mount({ mapRef: ref }, [RING, RING])
    act(() => result.current.mode.editArea(1))
    expect(result.current.mode.editing).toBe(1)
    expect(map.restoreRing).toHaveBeenLastCalledWith(RING)
    expect(map.framePolygon).toHaveBeenCalledOnce()
    act(() => void result.current.mode.finishDrawing())
    expect(result.current.areas).toEqual([RING, OTHER])
    expect(result.current.mode.editing).toBeNull()
  })

  // A ring under three points is no area, so Done (or the Analyze that ends
  // drawing) drops it and the areas stand as they were.
  it('drops a ring under three points at Done', () => {
    const { ref } = mapStub(null)
    const { result } = mount({ mapRef: ref }, [RING])
    act(() => result.current.mode.startArea())
    let answered: GeoPolygon[] = []
    act(() => {
      answered = result.current.mode.finishDrawing()
    })
    expect(answered).toEqual([RING])
    expect(result.current.areas).toEqual([RING])
  })

  // Cancel needs no copy of anything: the areas change only at Done.
  it('leaves the areas as they were on Cancel and on Escape', () => {
    const { map, ref } = mapStub(OTHER)
    const { result } = mount({ mapRef: ref }, [RING])
    act(() => result.current.mode.editArea(0))
    act(() => result.current.mode.handleCancelDrawing())
    expect(result.current.areas).toEqual([RING])
    expect(result.current.mode.drawing).toBe(false)
    expect(map.restoreRing).toHaveBeenLastCalledWith(null)

    act(() => result.current.mode.startArea())
    press('Escape')
    expect(result.current.mode.drawing).toBe(false)
    expect(result.current.areas).toEqual([RING])
  })

  it('removes an area from its ×, leaving the mode when it was the one edited', () => {
    const { ref } = mapStub()
    const { result } = mount({ mapRef: ref }, [RING, OTHER, RING])
    act(() => result.current.mode.editArea(2))
    act(() => result.current.mode.removeArea(0))
    expect(result.current.areas).toEqual([OTHER, RING])
    // The edited area moved up one, and is still the one edited.
    expect(result.current.mode.editing).toBe(1)
    act(() => result.current.mode.removeArea(1))
    expect(result.current.areas).toEqual([OTHER])
    expect(result.current.mode.drawing).toBe(false)
  })

  it('starts no new area at the cap', () => {
    const full = Array.from({ length: MAX_AREAS }, () => RING)
    const { result } = mount({}, full)
    act(() => result.current.mode.startArea())
    expect(result.current.mode.drawing).toBe(false)
  })

  it('finishes on Enter only once the ring has three points', () => {
    const { result } = mount()
    act(() => result.current.mode.startArea())
    act(() => result.current.mode.handleDrawUpdate(2))
    press('Enter')
    expect(result.current.mode.drawing).toBe(true)
    act(() => result.current.mode.handleDrawUpdate(3))
    press('Enter')
    expect(result.current.mode.drawing).toBe(false)
  })

  it('leaves Enter and Escape to a field that has the focus', () => {
    const field = document.createElement('textarea')
    document.body.append(field)
    field.focus()
    const { result } = mount()
    act(() => result.current.mode.startArea())
    press('Escape')
    expect(result.current.mode.drawing).toBe(true)
    // A ring that could finish, so only the field's claim keeps Enter (a CSV
    // newline) from finishing it.
    act(() => result.current.mode.handleDrawUpdate(3))
    press('Enter')
    expect(result.current.mode.drawing).toBe(true)
    field.remove()
  })

  // MapView is memoized, and `handleDrawUpdate` is one of its props.
  it('keeps the update handler stable across renders', () => {
    const { result, rerender } = mount()
    const before = result.current.mode.handleDrawUpdate
    act(() => result.current.mode.handleDrawUpdate(1))
    rerender()
    expect(result.current.mode.handleDrawUpdate).toBe(before)
  })
})
