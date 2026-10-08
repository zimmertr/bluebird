import { describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import { watchView } from './viewWatch'

// Enough of a map to be watched: bounds to read, and the one event.
function fakeMap() {
  const handlers = new Set<() => void>()
  const bounds = { getWest: () => -125, getSouth: () => 45, getEast: () => -116, getNorth: () => 49 }
  const map = {
    getBounds: () => bounds,
    on: vi.fn((_event: string, handler: () => void) => handlers.add(handler)),
    off: vi.fn((_event: string, handler: () => void) => handlers.delete(handler)),
  }
  return { map: map as unknown as maplibregl.Map, bounds, settle: () => handlers.forEach((h) => h()) }
}

describe('watchView', () => {
  it('reports the view at once and after each settled move, until let go', () => {
    const { map, bounds, settle } = fakeMap()
    const onBounds = vi.fn()
    const stop = watchView(map, onBounds)
    expect(onBounds).toHaveBeenCalledTimes(1)
    expect(onBounds).toHaveBeenLastCalledWith(bounds)
    settle()
    expect(onBounds).toHaveBeenCalledTimes(2)
    stop()
    settle()
    expect(onBounds).toHaveBeenCalledTimes(2)
    expect(map.on).toHaveBeenCalledWith('moveend', expect.any(Function))
    expect(map.off).toHaveBeenCalledWith('moveend', expect.any(Function))
  })
})
