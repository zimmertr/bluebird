import { describe, expect, it, vi } from 'vitest'
import { watchView } from './viewWatch'
import { stubMap } from '../testSupport/stubMap'
import type { ViewBounds } from '../utils/layerCoverage'

const edges = (view: ViewBounds) => [view.getWest(), view.getSouth(), view.getEast(), view.getNorth()]

describe('watchView', () => {
  it('reports the view at once and after each settled move, until let go', () => {
    const stub = stubMap({ bounds: { west: -125, south: 45, east: -116, north: 49 } })
    const onBounds = vi.fn()
    const stop = watchView(stub.map, onBounds)
    expect(onBounds).toHaveBeenCalledTimes(1)
    expect(edges(onBounds.mock.lastCall![0])).toEqual([-125, 45, -116, 49])
    stub.fire('moveend')
    expect(onBounds).toHaveBeenCalledTimes(2)
    expect(edges(onBounds.mock.lastCall![0])).toEqual([-125, 45, -116, 49])
    stop()
    expect(stub.handlerCount('moveend')).toBe(0)
    stub.fire('moveend')
    expect(onBounds).toHaveBeenCalledTimes(2)
  })
})
