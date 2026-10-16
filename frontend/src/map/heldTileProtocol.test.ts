import { describe, expect, it, vi } from 'vitest'
import { holdingLoader, radarRequest, serveHeldTiles, snowRequest } from './heldTileProtocol'
import { heldTiles } from '../utils/heldTiles'
import { RADAR_SCHEME, radarTileHref } from '../utils/radar'
import { SNOW_SCHEME, snowExportHref } from '../utils/snowDepth'
import { fakeResponse } from '../testSupport/fixtures'

describe('the schemes', () => {
  it('names a radar tile by its frame and position, and its real URL', () => {
    expect(radarRequest('20/5/7/12')).toEqual({ layer: 'radar-20', z: 5, x: 7, y: 12, url: radarTileHref(20, 5, 7, 12) })
    expect(radarRequest('5/7/12')).toBeNull()
  })

  it('names a snow tile by its position, and the render that draws it', () => {
    expect(snowRequest('9/82/178')).toEqual({ layer: 'snow', z: 9, x: 82, y: 178, url: snowExportHref(9, 82, 178) })
    expect(snowRequest('9/x/178')).toBeNull()
  })

  it('registers both', () => {
    const add = vi.fn()
    serveHeldTiles(add)
    expect(add.mock.calls.map((c) => c[0])).toEqual([RADAR_SCHEME, SNOW_SCHEME])
  })
})

describe('holdingLoader', () => {
  // MapLibre gets the bytes and the cache headers it would have read itself,
  // so its refresh rules are unchanged, and the app keeps a copy.
  it('fetches the real tile, keeps a copy, and hands MapLibre the bytes and headers', async () => {
    const tiles = heldTiles({ size: 256, decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255]) }) })
    const fetchWith = vi.fn().mockResolvedValue(fakeResponse({ raw: 'png' }, 200, { 'Cache-Control': 'public, max-age=300' }))
    const load = holdingLoader(RADAR_SCHEME, tiles, radarRequest, fetchWith)
    const answer = await load({ url: `${RADAR_SCHEME}://0/8/41/88` }, new AbortController())
    expect(fetchWith.mock.calls[0][0]).toBe(radarTileHref(0, 8, 41, 88))
    expect(new TextDecoder().decode(answer.data)).toBe('png')
    expect(answer.cacheControl).toBe('public, max-age=300')
    expect(tiles.pixelNow('radar-0', (41.5 / 256) * 360 - 180, 48.4, 8)).not.toBeNull()
  })

  it('fails a path it cannot read, and a fetch that fails', async () => {
    const tiles = heldTiles({ size: 256 })
    const load = holdingLoader(RADAR_SCHEME, tiles, radarRequest, vi.fn().mockRejectedValue(new Error('down')))
    await expect(load({ url: `${RADAR_SCHEME}://nope` }, new AbortController())).rejects.toThrow('Not a')
    await expect(load({ url: `${RADAR_SCHEME}://0/8/41/88` }, new AbortController())).rejects.toThrow('down')
  })
})
