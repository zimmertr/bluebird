import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDestinationInputs } from './useDestinationInputs'
import { place } from '../testSupport/fixtures'
import type { GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}

// The lists' events, which App turns into a frame and a message.
const LIST_EVENTS = { onArrived: () => {}, onFailed: () => {} }

// What `App.tsx` decodes once and holds in a ref, so every render hands the
// hook the same object. A literal inside the render callback would be a new
// link on every render, and the pin restore would run on each of them.
describe('useDestinationInputs', () => {
  it('opens on what the link restored', () => {
    const baker = place()
    const link = {
      areas: [RING],
      destinationTypes: ['peak' as const],
      includeUnnamedPeaks: true,
      customCsv: '46.85,-121.76,Rainier',
      pins: [baker],
    }
    const { result } = renderHook(() => useDestinationInputs(link, LIST_EVENTS))
    expect(result.current.areas).toEqual([RING])
    expect(result.current.destinationTypes).toEqual(['peak'])
    expect(result.current.includeUnnamedPeaks).toBe(true)
    expect(result.current.restoredPoints).toHaveLength(2)
    expect(result.current.places).toEqual([baker])
    expect(result.current.destinationNamed).toBe(true)
  })

  // Areas restored from a link have no map behind them yet, so each area is
  // read off its ring rather than waited for (#429), and the largest is the
  // one the cap reads, the ring being drawn among them.
  it('measures each area it holds and the largest of them, and nothing without one', () => {
    const big: GeoPolygon = {
      type: 'Polygon',
      coordinates: [[[-122, 47], [-121, 47], [-121, 48], [-122, 47]]],
    }
    const link = { areas: [RING, big] }
    const withAreas = renderHook(() => useDestinationInputs(link, LIST_EVENTS))
    const [small, large] = withAreas.result.current.areaKm2s
    expect(small).toBeGreaterThan(0)
    expect(large).toBeGreaterThan(small)
    expect(withAreas.result.current.largestAreaKm2).toBe(large)
    const without = renderHook(() => useDestinationInputs(null, LIST_EVENTS))
    expect(without.result.current.largestAreaKm2).toBeNull()
    act(() => without.result.current.setDraft(big))
    expect(without.result.current.largestAreaKm2).toBe(large)
    expect(without.result.current.draftAreaKm2).toBe(large)
  })

  it('names a destination on the first row that parses, and not before', () => {
    const { result } = renderHook(() => useDestinationInputs(null, LIST_EVENTS))
    expect(result.current.destinationNamed).toBe(false)
    act(() => result.current.setCustomCsv('46.85'))
    expect(result.current.destinationNamed).toBe(false)
    act(() => result.current.setCustomCsv('46.85,-121.76'))
    expect(result.current.destinationNamed).toBe(true)
    act(() => result.current.setCustomCsv('46.85,-121.76,R'))
    expect(result.current.destinationNamed).toBe(true)
  })

  it('names a destination when a place is searched, and forgets it when removed', () => {
    const { result } = renderHook(() => useDestinationInputs(null, LIST_EVENTS))
    const baker = place()
    act(() => result.current.addPlace(baker))
    expect(result.current.destinationNamed).toBe(true)
    act(() => result.current.removePlace(baker.lat, baker.lon))
    expect(result.current.destinationNamed).toBe(false)
  })

  // The same feature found again is the same destination, with what the
  // search knows about it now.
  it('re-searching a place refreshes it rather than listing it twice', () => {
    const { result } = renderHook(() => useDestinationInputs(null, LIST_EVENTS))
    const baker = place()
    act(() => result.current.addPlace(baker))
    act(() => result.current.addPlace({ ...baker, label: 'Mount Baker (Koma Kulshan)' }))
    expect(result.current.places).toEqual([{ ...baker, label: 'Mount Baker (Koma Kulshan)' }])
  })

  // The removal scope is the authored inputs: a new kind or a new line moves
  // it, and a searched place does not.
  it('moves the authored scope with the kinds and the lines, not the searched places', () => {
    const { result } = renderHook(() => useDestinationInputs(null, LIST_EVENTS))
    const first = result.current.destinationScope
    act(() => result.current.addPlace(place()))
    expect(result.current.destinationScope).toBe(first)
    act(() => result.current.setDestinationTypes(['lake']))
    expect(result.current.destinationScope).not.toBe(first)
    const second = result.current.destinationScope
    act(() => result.current.setCustomCsv('46.85,-121.76'))
    expect(result.current.destinationScope).not.toBe(second)
  })

  // MapView is memoized, and these are its props.
  it('keeps the parsed rows, the restored points and the callbacks stable across a render that changes nothing', () => {
    const link = { customCsv: '46.85,-121.76' }
    const { result, rerender } = renderHook(() => useDestinationInputs(link, LIST_EVENTS))
    const before = result.current
    rerender()
    expect(result.current.csvRows).toBe(before.csvRows)
    expect(result.current.restoredPoints).toBe(before.restoredPoints)
    expect(result.current.places).toBe(before.places)
    expect(result.current.setAreas).toBe(before.setAreas)
    expect(result.current.setDraft).toBe(before.setDraft)
    expect(result.current.addPlace).toBe(before.addPlace)
    expect(result.current.removePlace).toBe(before.removePlace)
  })
})
