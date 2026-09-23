import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type RemovalInputs, useRemovals } from './useRemovals'
import { place, resultRow } from '../testSupport/fixtures'
import { authoredScope } from '../utils/removals'
import { geoKey } from '../utils/points'

const BAKER = place()
const BAKER_ROW = resultRow({ name: 'Mount Baker', latitude: BAKER.lat, longitude: BAKER.lon })
const RAINIER_ROW = resultRow()
const SCOPE = authoredScope(['peak'], '')
// Hoisted: a fresh array per render would be a new input every time, the way
// App.tsx never hands one.
const PLACES = [BAKER]
const FIELD = [RAINIER_ROW]
const NO_ROWS: RemovalInputs['csvRows'] = []

function inputs(over: Partial<RemovalInputs> = {}): RemovalInputs {
  return {
    places: PLACES,
    addPlace: vi.fn(),
    removePlace: vi.fn(),
    destinationScope: SCOPE,
    csvRows: NO_ROWS,
    universe: FIELD,
    response: null,
    ...over,
  }
}

describe('useRemovals', () => {
  it('records a × with its backing place, and deregisters that place', () => {
    const removePlace = vi.fn()
    const { result } = renderHook(() => useRemovals(inputs({ removePlace })))
    act(() => result.current.removeResult(BAKER_ROW))
    const key = geoKey(BAKER.lat, BAKER.lon)
    expect(result.current.removed.get(key)?.place).toEqual(BAKER)
    expect([...result.current.removedKeys]).toEqual([key])
    expect([...result.current.activeRemovedKeys]).toEqual([key])
    expect(removePlace).toHaveBeenCalledWith(BAKER.lat, BAKER.lon)
  })

  // A removal made under an earlier list stops hiding the preview (#158), and
  // the report keeps it.
  it('keeps every key for the report and only the live scope for the preview', () => {
    let scope = SCOPE
    const { result, rerender } = renderHook(() => useRemovals(inputs({ destinationScope: scope })))
    act(() => result.current.removeResult(RAINIER_ROW))
    scope = authoredScope(['peak', 'lake'], '')
    rerender()
    expect(result.current.removedKeys.size).toBe(1)
    expect(result.current.activeRemovedKeys.size).toBe(0)
  })

  it('re-registers a searched place on restore, and unhides a held row without one', () => {
    const addPlace = vi.fn()
    const { result } = renderHook(() => useRemovals(inputs({ addPlace })))
    act(() => result.current.removeResult(BAKER_ROW))
    act(() => result.current.removeResult(RAINIER_ROW))
    act(() => result.current.restoreRemoved(geoKey(RAINIER_ROW.latitude, RAINIER_ROW.longitude)))
    expect(addPlace).not.toHaveBeenCalled()
    expect(result.current.removed.size).toBe(1)
    act(() => result.current.restoreAllRemoved())
    expect(addPlace).toHaveBeenCalledWith(BAKER)
    expect(result.current.removed.size).toBe(0)
  })

  it('drops a stale removal when the same spot is named again', () => {
    const addPlace = vi.fn()
    const { result } = renderHook(() => useRemovals(inputs({ addPlace })))
    act(() => result.current.removeResult(BAKER_ROW))
    act(() => result.current.registerPlace(BAKER))
    expect(addPlace).toHaveBeenCalledWith(BAKER)
    expect(result.current.removed.size).toBe(0)
  })

  // Only a genuine discovery change clears the set; the same scope again is a
  // re-analysis that keeps the reader's work.
  it('clears for a new scope only', () => {
    const { result } = renderHook(() => useRemovals(inputs()))
    act(() => result.current.clearForScope('a'))
    act(() => result.current.removeResult(RAINIER_ROW))
    act(() => result.current.clearForScope('a'))
    expect(result.current.removed.size).toBe(1)
    act(() => result.current.clearForScope('b'))
    expect(result.current.removed.size).toBe(0)
  })
})
