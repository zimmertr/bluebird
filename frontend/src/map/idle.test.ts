import { describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import { mapIdle } from './idle'

function fakeMap(moving: boolean, tiles: boolean) {
  let idle: (() => void) | null = null
  const map = {
    isMoving: () => moving,
    areTilesLoaded: () => tiles,
    once: vi.fn((_event: string, fn: () => void) => {
      idle = fn
    }),
  }
  return { map: map as unknown as maplibregl.Map, fire: () => idle?.(), once: map.once }
}

describe('mapIdle', () => {
  it('resolves at once for a loaded map at rest with its tiles drawn', async () => {
    const { map, once } = fakeMap(false, true)
    await mapIdle(map, true)
    expect(once).not.toHaveBeenCalled()
  })

  it.each([
    ['not loaded', false, false, true],
    ['moving', true, true, true],
    ['still drawing tiles', true, false, false],
  ])('waits for the next idle while the map is %s', async (_why, loaded, moving, tiles) => {
    const { map, fire, once } = fakeMap(moving, tiles)
    let done = false
    const waiting = mapIdle(map, loaded).then(() => (done = true))
    await Promise.resolve()
    expect(done).toBe(false)
    expect(once).toHaveBeenCalledWith('idle', expect.any(Function))
    fire()
    await waiting
    expect(done).toBe(true)
  })
})
