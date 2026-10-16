import { describe, expect, it, vi } from 'vitest'
import { heldTiles, tilePixel } from './heldTiles'
import { solidTile, storeHolding } from '../testSupport/heldTiles'

const RED = [255, 0, 0, 255] as const

describe('tilePixel', () => {
  it('finds the tile and the pixel under a point', () => {
    expect(tilePixel(0, 0, 1, 256)).toEqual({ z: 1, x: 1, y: 1, px: 0, py: 0 })
    expect(tilePixel(-180, 85.05, 1, 256)).toEqual({ z: 1, x: 0, y: 0, px: 0, py: 0 })
    const { px, py } = tilePixel(179.999, -85.05, 3, 512)
    expect([px, py]).toEqual([511, 511])
  })
})

describe('heldTiles', () => {
  it('reads nothing where no tile is held', async () => {
    const tiles = heldTiles({ size: 256 })
    expect(tiles.pixelNow('radar-0', -121, 47, 8)).toBeNull()
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toBeNull()
  })

  // The first read decodes; every later one is answered at once, which is
  // what lets a pointer move ask on every frame.
  it('decodes a held tile once and then reads it at once', async () => {
    const tiles = storeHolding({ size: 256, layer: 'radar-0', lng: -121, lat: 47, z: 8, rgba: RED })
    expect(tiles.pixelNow('radar-0', -121, 47, 8)).toBe('pending')
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toEqual(RED)
    expect(tiles.pixelNow('radar-0', -121, 47, 8)).toEqual(RED)
    expect(tiles.decodes()).toBe(1)
  })

  // While a tile loads, MapLibre draws its parent scaled up.
  it('reads a parent tile where the map has not loaded its own zoom yet', async () => {
    const tiles = storeHolding({ size: 256, layer: 'radar-0', lng: -121, lat: 47, z: 6, rgba: RED })
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toEqual(RED)
    expect(await tiles.pixel('radar-0', -121, 47, 11)).toBeNull()
  })

  it('keeps each layer apart, and forgets a layer dropped', async () => {
    const tiles = storeHolding({ size: 256, layer: 'radar-20', lng: -121, lat: 47, z: 8, rgba: RED })
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toBeNull()
    tiles.drop('radar-')
    expect(await tiles.pixel('radar-20', -121, 47, 8)).toBeNull()
  })

  // A refreshed frame is a new picture, so it is decoded again.
  it('reads a replaced tile afresh', async () => {
    const decode = vi.fn().mockResolvedValueOnce(solidTile(256, RED)).mockResolvedValueOnce(solidTile(256, [0, 0, 255, 255]))
    const tiles = heldTiles({ size: 256, decode })
    const { x, y } = tilePixel(-121, 47, 8, 256)
    tiles.put('radar-0', 8, x, y, new Blob(['a']))
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toEqual(RED)
    tiles.put('radar-0', 8, x, y, new Blob(['b']))
    expect(await tiles.pixel('radar-0', -121, 47, 8)).toEqual([0, 0, 255, 255])
  })

  it('keeps no more images than it was told to, oldest dropped first', async () => {
    const tiles = heldTiles({ size: 256, maxHeld: 2, decode: async () => solidTile(256, RED) })
    tiles.put('radar-0', 1, 0, 0, new Blob(['a']))
    tiles.put('radar-0', 1, 1, 0, new Blob(['b']))
    tiles.put('radar-0', 1, 1, 1, new Blob(['c']))
    expect(await tiles.pixel('radar-0', -90, 45, 1)).toBeNull()
    expect(await tiles.pixel('radar-0', 90, -45, 1)).toEqual(RED)
  })
})
