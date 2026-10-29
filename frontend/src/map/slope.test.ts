import { describe, expect, it, vi } from 'vitest'

// MapLibre needs a DOM, which node does not have; the scheme is registered
// through it, so the suite hands in its own.
vi.mock('maplibre-gl', () => ({ addProtocol: vi.fn() }))

import { SLOPE_SCHEME, SLOPE_TILES, serveSlopeTiles, slopeTile, type DemGrids } from './slope'
import type { HeightGrid } from '../utils/slopeAngle'

const SIZE = 4

/** A flat tile at `metres`, so its edges show which neighbour was read. */
const flat = (metres: number): HeightGrid => ({ width: SIZE, height: SIZE, data: new Float32Array(SIZE * SIZE).fill(metres) })

/** An elevation cache that answers every address it holds and refuses the rest, as the library does a 404. */
function demOf(held: Record<string, HeightGrid>) {
  const asked: string[] = []
  const dem: DemGrids = {
    getDemTile: vi.fn(async (z: number, x: number, y: number) => {
      const key = `${z}/${x}/${y}`
      asked.push(key)
      if (!held[key]) throw new Error(`Bad response: 404 for ${key}`)
      return held[key]
    }),
  }
  return { dem, asked }
}

/** Hands the RGBA back as it came, so a test can read the pixels. */
const passThrough = async (rgba: Uint8ClampedArray<ArrayBuffer>) => rgba as unknown as ImageBitmap

describe('slopeTile', () => {
  // The tile and the four that touch its edges, from the shared cache, at the
  // tile's own zoom.
  it('asks the cache for the tile and its four edge neighbours', async () => {
    const { dem, asked } = demOf({ '12/656/1442': flat(1000) })
    await slopeTile(dem, 12, 656, 1442, new AbortController(), passThrough)
    expect(asked.sort()).toEqual(['12/655/1442', '12/656/1441', '12/656/1442', '12/656/1443', '12/657/1442'])
  })

  // East and west wrap round the antimeridian; nothing is asked past the top
  // or the bottom of the world.
  it('wraps east and west and asks for nothing past the poles', async () => {
    const { dem, asked } = demOf({ '2/0/0': flat(0) })
    await slopeTile(dem, 2, 0, 0, new AbortController(), passThrough)
    expect(asked.sort()).toEqual(['2/0/0', '2/0/1', '2/1/0', '2/3/0'])
  })

  // A neighbour that answers paints its edge: the east tile stands a cliff
  // above this one, so the last column is steep and the rest flat. A missing
  // neighbour is not a failure. A 4px tile's pixel is 1.7 km of ground here,
  // so the cliff is 5 km high to read steep across two of them.
  it('reads its edges from the neighbours it has and carries on without the rest', async () => {
    const { dem } = demOf({ '12/656/1442': flat(1000), '12/657/1442': flat(6000) })
    const rgba = (await slopeTile(dem, 12, 656, 1442, new AbortController(), passThrough)) as unknown as Uint8ClampedArray
    const alpha = (col: number, row: number) => rgba[(row * SIZE + col) * 4 + 3]
    for (let row = 0; row < SIZE; row++) expect([alpha(SIZE - 1, row), alpha(0, row), alpha(1, row)]).toEqual([255, 0, 0])
  })

  // Open ocean has no tile; the request fails as the relief's does.
  it('fails when its own tile does not load', async () => {
    const { dem } = demOf({})
    await expect(slopeTile(dem, 12, 1, 1, new AbortController(), passThrough)).rejects.toThrow('404')
  })

  it("hands the cache the request's abort, so a tile panned away stops loading", async () => {
    const { dem } = demOf({ '12/656/1442': flat(1000) })
    const abort = new AbortController()
    await slopeTile(dem, 12, 656, 1442, abort, passThrough)
    expect(dem.getDemTile).toHaveBeenCalledWith(12, 656, 1442, abort)
  })
})

describe('serveSlopeTiles', () => {
  it('registers the scheme the source names, and answers a tile by its address', async () => {
    const register = vi.fn()
    const { dem, asked } = demOf({ '9/82/180': flat(500) })
    const toImage = vi.fn(async () => 'bitmap' as unknown as ImageBitmap)
    serveSlopeTiles(dem, { register, toImage })
    expect(SLOPE_TILES).toBe(`${SLOPE_SCHEME}://{z}/{x}/{y}`)
    expect(register).toHaveBeenCalledWith(SLOPE_SCHEME, expect.any(Function))
    const loader = register.mock.calls[0][1]
    const answer = await loader({ url: `${SLOPE_SCHEME}://9/82/180` }, new AbortController())
    expect(answer).toEqual({ data: 'bitmap' })
    expect(asked).toContain('9/82/180')
    expect(toImage).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), SIZE, SIZE)
  })
})
