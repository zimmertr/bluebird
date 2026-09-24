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
const NO_PLACES: RemovalInputs['places'] = []

function inputs(over: Partial<RemovalInputs> = {}): RemovalInputs {
  return {
    places: PLACES,
    addPlace: vi.fn(),
    removePlace: vi.fn(),
    destinationScope: SCOPE,
    csvRows: NO_ROWS,
    universe: FIELD,
    response: null,
    restoredRemoved: undefined,
    restoredScope: SCOPE,
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

  // A row the browser still holds comes back by unhiding alone: on the server
  // path the trimmed response rows are what it holds, and a pasted line is
  // held by the textarea, whose text survives the ×.
  it('unhides a row held by the response rows or the pasted list, with no place', () => {
    const key = geoKey(RAINIER_ROW.latitude, RAINIER_ROW.longitude)
    const response = { results: [RAINIER_ROW], total_queried: 1, total_matched: 1 }
    const pasted = [{ name: 'Rainier', latitude: RAINIER_ROW.latitude, longitude: RAINIER_ROW.longitude }]
    for (const over of [{ universe: null, response }, { universe: null, csvRows: pasted }]) {
      const addPlace = vi.fn()
      const { result } = renderHook(() => useRemovals(inputs({ addPlace, ...over })))
      act(() => result.current.removeResult(RAINIER_ROW))
      act(() => result.current.restoreRemoved(key))
      expect(result.current.removed.size).toBe(0)
      expect(addPlace).not.toHaveBeenCalled()
    }
  })

  // The control: with nothing holding the row, a restore re-registers a place.
  it('re-registers a place when nothing holds the row', () => {
    const addPlace = vi.fn()
    const { result } = renderHook(() => useRemovals(inputs({ addPlace, universe: null })))
    act(() => result.current.removeResult(RAINIER_ROW))
    act(() => result.current.restoreRemoved(geoKey(RAINIER_ROW.latitude, RAINIER_ROW.longitude)))
    expect(addPlace).toHaveBeenCalledTimes(1)
  })
})

// A link carries removals as coordinates alone (#292).
describe('removals a link carried', () => {
  const KEY = geoKey(RAINIER_ROW.latitude, RAINIER_ROW.longitude)
  const LINK_SCOPE = 'the link scope'

  it('hides its rows from the first render, before any field is held', () => {
    const { result } = renderHook(() =>
      useRemovals(inputs({ universe: null, restoredRemoved: [KEY], restoredScope: LINK_SCOPE })),
    )
    expect([...result.current.removedKeys]).toEqual([KEY])
    expect([...result.current.activeRemovedKeys]).toEqual([KEY])
    expect(result.current.removed.size).toBe(0)
  })

  it('lists a removal with its row once the field holds it', () => {
    const { result, rerender } = renderHook((p: RemovalInputs) => useRemovals(p), {
      initialProps: inputs({ universe: null, restoredRemoved: [KEY], restoredScope: LINK_SCOPE }),
    })
    rerender(inputs({ universe: FIELD, restoredRemoved: [KEY], restoredScope: LINK_SCOPE }))
    expect(result.current.removed.get(KEY)?.row).toBe(RAINIER_ROW)
  })

  // The first Analyze of a link runs under the link's own ring and list.
  it('survives the link\'s own first Analyze, and clears on a real change', () => {
    const { result } = renderHook(() => useRemovals(inputs({ restoredRemoved: [KEY], restoredScope: LINK_SCOPE })))
    act(() => result.current.clearForScope(LINK_SCOPE))
    expect([...result.current.removedKeys]).toEqual([KEY])
    act(() => result.current.clearForScope('another scope'))
    expect(result.current.removedKeys.size).toBe(0)
  })

  it('leaves the link on restore, alone or with the rest', () => {
    const { result } = renderHook(() => useRemovals(inputs({ restoredRemoved: [KEY], restoredScope: LINK_SCOPE })))
    act(() => result.current.restoreRemoved(KEY))
    expect(result.current.removedKeys.size).toBe(0)

    const all = renderHook(() => useRemovals(inputs({ restoredRemoved: [KEY], restoredScope: LINK_SCOPE })))
    act(() => all.result.current.removeResult(BAKER_ROW))
    act(() => all.result.current.restoreAllRemoved())
    expect(all.result.current.removedKeys.size).toBe(0)
  })

  // A key the landed field does not hold hides nothing and cannot be listed or
  // restored, so it leaves the set and every later link.
  it('drops a linked key the landed field does not hold', () => {
    const ORPHAN = '1.00000,2.00000'
    const { result, rerender } = renderHook((p: RemovalInputs) => useRemovals(p), {
      initialProps: inputs({ universe: null, restoredRemoved: [ORPHAN, KEY], restoredScope: LINK_SCOPE }),
    })
    expect([...result.current.removedKeys]).toEqual([ORPHAN, KEY])
    rerender(inputs({ universe: FIELD, restoredRemoved: [ORPHAN, KEY], restoredScope: LINK_SCOPE }))
    expect([...result.current.removedKeys]).toEqual([KEY])
    expect([...result.current.activeRemovedKeys]).toEqual([KEY])
  })

  // × on a searched place deregisters it, so the sender's link carries the
  // removal and no pin: the reopened field never holds the row.
  it('drops the removal of a searched place the link carries no pin for', () => {
    const PIN_KEY = geoKey(BAKER.lat, BAKER.lon)
    const { result } = renderHook(() =>
      useRemovals(inputs({ places: NO_PLACES, universe: FIELD, restoredRemoved: [PIN_KEY], restoredScope: LINK_SCOPE })),
    )
    expect(result.current.removedKeys.size).toBe(0)
    expect(result.current.removed.size).toBe(0)
  })

  // A later list is a new list: the link's removals stop hiding its pending lines.
  it('stops hiding pending lines once the list is rewritten', () => {
    const { result, rerender } = renderHook((p: RemovalInputs) => useRemovals(p), {
      initialProps: inputs({ restoredRemoved: [KEY], restoredScope: LINK_SCOPE }),
    })
    expect([...result.current.activeRemovedKeys]).toEqual([KEY])
    rerender(inputs({ destinationScope: 'rewritten', restoredRemoved: [KEY], restoredScope: LINK_SCOPE }))
    expect([...result.current.removedKeys]).toEqual([KEY])
    expect(result.current.activeRemovedKeys.size).toBe(0)
  })
})
