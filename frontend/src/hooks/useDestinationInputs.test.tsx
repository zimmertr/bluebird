import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDestinationInputs } from './useDestinationInputs'
import { place } from '../testSupport/fixtures'
import type { GeoPolygon } from '../types'

const RING: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]],
}

// What `App.tsx` decodes once and holds in a ref, so every render hands the
// hook the same object. A literal inside the render callback would be a new
// link on every render, and the pin restore would run on each of them.
describe('useDestinationInputs', () => {
  it('opens on what the link restored', () => {
    const baker = place()
    const link = {
      polygon: RING,
      destinationTypes: ['peak' as const],
      includeUnnamedPeaks: true,
      customCsv: '46.85,-121.76,Rainier',
      pins: [baker],
    }
    const { result } = renderHook(() => useDestinationInputs(link))
    expect(result.current.polygon).toBe(RING)
    expect(result.current.destinationTypes).toEqual(['peak'])
    expect(result.current.includeUnnamedPeaks).toBe(true)
    expect(result.current.restoredPoints).toHaveLength(2)
    expect(result.current.places).toEqual([baker])
    expect(result.current.destinationNamed).toBe(true)
  })

  // A ring restored from a link has no map behind it yet, so the area is read
  // off the ring rather than waited for (#429).
  it('measures the ring it holds, and nothing without one', () => {
    const link = { polygon: RING }
    const withRing = renderHook(() => useDestinationInputs(link))
    expect(withRing.result.current.polygonAreaKm2).toBeGreaterThan(0)
    const without = renderHook(() => useDestinationInputs(null))
    expect(without.result.current.polygonAreaKm2).toBeNull()
  })

  it('names a destination on the first row that parses, and not before', () => {
    const { result } = renderHook(() => useDestinationInputs(null))
    expect(result.current.destinationNamed).toBe(false)
    act(() => result.current.setCustomCsv('46.85'))
    expect(result.current.destinationNamed).toBe(false)
    act(() => result.current.setCustomCsv('46.85,-121.76'))
    expect(result.current.destinationNamed).toBe(true)
    act(() => result.current.setCustomCsv('46.85,-121.76,R'))
    expect(result.current.destinationNamed).toBe(true)
  })

  it('names a destination when a place is searched, and forgets it when removed', () => {
    const { result } = renderHook(() => useDestinationInputs(null))
    const baker = place()
    act(() => result.current.addPlace(baker))
    expect(result.current.destinationNamed).toBe(true)
    act(() => result.current.removePlace(baker.lat, baker.lon))
    expect(result.current.destinationNamed).toBe(false)
  })

  // The removal scope is the authored inputs: a new kind or a new line moves
  // it, and a searched place does not.
  it('moves the authored scope with the kinds and the lines, not the searched places', () => {
    const { result } = renderHook(() => useDestinationInputs(null))
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
    const { result, rerender } = renderHook(() => useDestinationInputs(link))
    const before = result.current
    rerender()
    expect(result.current.csvRows).toBe(before.csvRows)
    expect(result.current.restoredPoints).toBe(before.restoredPoints)
    expect(result.current.places).toBe(before.places)
    expect(result.current.setPolygon).toBe(before.setPolygon)
    expect(result.current.addPlace).toBe(before.addPlace)
    expect(result.current.removePlace).toBe(before.removePlace)
  })
})
