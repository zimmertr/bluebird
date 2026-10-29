import { describe, expect, it, vi } from 'vitest'

// MapLibre needs a DOM, which node does not have; the scheme is registered
// through it, so the suite hands in its own.
vi.mock('maplibre-gl', () => ({ addProtocol: vi.fn() }))

import { SLOPE_SCHEME, SLOPE_TILES, serveSlopeTiles, slopeTile, type DemGrids } from './slope'
import { slopeRaster, type HeightGrid } from '../utils/slopeAngle'

const SIZE = 4

/** A flat tile at `metres`, so its edges show which neighbour was read. */
const flat = (metres: number): HeightGrid => ({ width: SIZE, height: SIZE, data: new Float32Array(SIZE * SIZE).fill(metres) })

/**
 * An elevation cache that answers every address it holds and refuses the
 * rest as the library does a 404, in the words its worker sends back: the
 * error's text, prefixed, with the tile's URL. An address in `failing`
 * refuses with a 500 instead.
 */
function demOf(held: Record<string, HeightGrid>, failing: string[] = []) {
  const asked: string[] = []
  const dem: DemGrids = {
    getDemTile: vi.fn(async (z: number, x: number, y: number) => {
      const key = `${z}/${x}/${y}`
      asked.push(key)
      const status = failing.includes(key) ? 500 : 404
      if (!held[key]) throw new Error(`Error: Bad response: ${status} for https://tiles.mapterhorn.com/${key}.webp`)
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
    await slopeTile(dem, 12, 656, 1442, new AbortController(), { toImage: passThrough })
    expect(asked.sort()).toEqual(['12/655/1442', '12/656/1441', '12/656/1442', '12/656/1443', '12/657/1442'])
  })

  // East and west wrap round the antimeridian; nothing is asked past the top
  // or the bottom of the world.
  it('wraps east and west and asks for nothing past the poles', async () => {
    const { dem, asked } = demOf({ '2/0/0': flat(0) })
    await slopeTile(dem, 2, 0, 0, new AbortController(), { toImage: passThrough })
    expect(asked.sort()).toEqual(['2/0/0', '2/0/1', '2/1/0', '2/3/0'])
  })

  // A neighbour that answers paints its edge: the east tile stands a cliff
  // above this one, so the last column is steep and the rest flat. A missing
  // neighbour is not a failure. A 4px tile's pixel is 1.7 km of ground here,
  // so the cliff is 5 km high to read steep across two of them.
  it('reads its edges from the neighbours it has and carries on without the rest', async () => {
    const { dem } = demOf({ '12/656/1442': flat(1000), '12/657/1442': flat(6000) })
    const rgba = (await slopeTile(dem, 12, 656, 1442, new AbortController(), { toImage: passThrough })) as unknown as Uint8ClampedArray
    const alpha = (col: number, row: number) => rgba[(row * SIZE + col) * 4 + 3]
    for (let row = 0; row < SIZE; row++) expect([alpha(SIZE - 1, row), alpha(0, row), alpha(1, row)]).toEqual([255, 0, 0])
  })

  // Open ocean has no tile; the request fails as the relief's does.
  it('fails when its own tile does not load', async () => {
    const { dem } = demOf({})
    await expect(slopeTile(dem, 12, 1, 1, new AbortController(), { toImage: passThrough })).rejects.toThrow('404')
  })

  it("hands the cache the request's abort, so a tile panned away stops loading", async () => {
    const { dem } = demOf({ '12/656/1442': flat(1000) })
    const abort = new AbortController()
    await slopeTile(dem, 12, 656, 1442, abort, { toImage: passThrough })
    expect(dem.getDemTile).toHaveBeenCalledWith(12, 656, 1442, abort)
  })
})

describe('slopeTile past zoom 12', () => {
  const N = 8
  /** Heights that rise and fall unevenly, seeded, so a tile paints several bands and some clear ground. */
  const rough = (seed: number): HeightGrid => {
    const data = new Float32Array(N * N)
    for (let i = 0; i < N * N; i++) data[i] = ((i * 7 + seed * 13) % 11) * 150 + (i % N) * 100
    return { width: N, height: N, data }
  }
  /** Rainier's zoom-12 tile and its four neighbours, all held. */
  const RAINIER_12 = {
    '12/662/1443': rough(1),
    '12/662/1442': rough(2),
    '12/662/1444': rough(3),
    '12/661/1443': rough(4),
    '12/663/1443': rough(5),
  }
  const read = async (dem: DemGrids, z: number, x: number, y: number, missing?: Set<string>) =>
    (await slopeTile(dem, z, x, y, new AbortController(), {
      toImage: passThrough,
      missing,
    })) as unknown as Uint8ClampedArray
  const px = (rgba: Uint8ClampedArray, col: number, row: number) =>
    Array.from(rgba.subarray((row * N + col) * 4, (row * N + col) * 4 + 4))

  // Zoom 13 is missing over this ground, as it is over the Sahara: the tile is
  // the zoom-12 tile's north-east quarter, every zoom-12 pixel painted as two
  // by two in the band the zoom-12 tile itself paints there.
  it('falls back to the zoom-12 quarter it lies over, in the bands the zoom-12 tile paints', async () => {
    const whole = await read(demOf(RAINIER_12).dem, 12, 662, 1443)
    const { dem, asked } = demOf(RAINIER_12)
    const quarter = await read(dem, 13, 1325, 2886)
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        expect([col, row, px(quarter, col, row)]).toEqual([col, row, px(whole, N / 2 + (col >> 1), row >> 1)])
      }
    }
    const painted = new Set(Array.from({ length: N * N }, (_, i) => quarter.slice(i * 4, i * 4 + 4).join()))
    expect(painted.size).toBeGreaterThan(2)
    // Its own zoom first, then the zoom-12 tile and only the two neighbours
    // the quarter touches, at zoom 12 as well, so the bands meet the next
    // tile's.
    expect(asked[0]).toBe('13/1325/2886')
    expect(asked.slice(1).sort()).toEqual(['12/662/1442', '12/662/1443', '12/663/1443'])
  })

  // Rainier answers at 13: the tile reads its own zoom and its neighbours
  // there, and asks nothing of 12.
  it('reads its own zoom where the survey reaches it, with its neighbours at that zoom', async () => {
    const own = {
      '13/1325/2886': rough(6),
      '13/1325/2885': rough(7),
      '13/1325/2887': rough(8),
      '13/1324/2886': rough(9),
      '13/1326/2886': rough(10),
    }
    const { dem, asked } = demOf(own)
    const tile = await read(dem, 13, 1325, 2886)
    expect(asked.sort()).toEqual(Object.keys(own).sort())
    const north = own['13/1325/2885']
    const south = own['13/1325/2887']
    const west = own['13/1324/2886']
    const east = own['13/1326/2886']
    expect(Array.from(tile)).toEqual(
      Array.from(slopeRaster(13, 2886, own['13/1325/2886'], { north, south, west, east })),
    )
  })

  // A 404 is asked once a session: the next tile under it, at its own zoom or
  // finer, goes straight to the zoom that answered.
  it('remembers a 404 and does not ask for it again, or for any tile under it', async () => {
    const missing = new Set<string>()
    const { dem, asked } = demOf(RAINIER_12)
    await read(dem, 13, 1325, 2886, missing)
    expect(missing).toEqual(new Set(['13/1325/2886']))
    asked.length = 0
    await read(dem, 13, 1325, 2886, missing)
    await read(dem, 14, 2651, 5773, missing)
    expect(asked.filter((key) => !key.startsWith('12/'))).toEqual([])
  })

  // Zoom 14 missing under a zoom 13 that answers, as over Rainier: one step
  // out, the 13 tile's quarter, and its neighbours at 13.
  it('steps out one zoom at a time and stops at the first that answers', async () => {
    const missing = new Set<string>()
    const { dem, asked } = demOf({ '13/1325/2886': rough(6), '13/1326/2886': rough(10) })
    await read(dem, 14, 2651, 5772, missing)
    expect(asked[0]).toBe('14/2651/5772')
    expect(asked.slice(1).sort()).toEqual(['13/1325/2885', '13/1325/2886', '13/1326/2886'])
    // The north neighbour at 13 answered 404 too, and is remembered with the 14.
    expect(missing).toEqual(new Set(['14/2651/5772', '13/1325/2885']))
  })

  // A failure that is not a 404 (a 500, a timeout) falls back as well, but is
  // asked again next time, since it may answer then.
  it('falls back on any failure but remembers only a 404', async () => {
    const missing = new Set<string>()
    const { dem, asked } = demOf(RAINIER_12, ['13/1325/2886'])
    await read(dem, 13, 1325, 2886, missing)
    await read(dem, 13, 1325, 2886, missing)
    expect(asked.filter((key) => key === '13/1325/2886')).toHaveLength(2)
    expect(missing.size).toBe(0)
  })

  // A tile panned away stops; it does not go on to ask for the zoom out.
  it('stops on an abort rather than falling back', async () => {
    const abort = new AbortController()
    const asked: string[] = []
    const dem: DemGrids = {
      getDemTile: vi.fn(async (z: number, x: number, y: number) => {
        asked.push(`${z}/${x}/${y}`)
        abort.abort()
        throw new Error('aborted')
      }),
    }
    await expect(slopeTile(dem, 13, 1325, 2886, abort, { toImage: passThrough })).rejects.toThrow('aborted')
    expect(asked).toEqual(['13/1325/2886'])
  })

  // Every zoom from the tile's own down to 13 missing, and 12 missing too: open
  // ocean, which fails the request as it does at 12.
  it('fails when even the zoom-12 tile does not load', async () => {
    const { dem, asked } = demOf({})
    await expect(read(dem, 14, 2651, 5773)).rejects.toThrow('404')
    expect(asked.slice(0, 3)).toEqual(['14/2651/5773', '13/1325/2886', '12/662/1443'])
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

  // The tiles known missing outlive one request, so a pan asks none again.
  it('remembers a 404 across the tiles it answers', async () => {
    const register = vi.fn()
    const { dem, asked } = demOf({ '12/662/1443': flat(500) })
    serveSlopeTiles(dem, { register, toImage: async () => 'bitmap' as unknown as ImageBitmap })
    const loader = register.mock.calls[0][1]
    await loader({ url: `${SLOPE_SCHEME}://13/1325/2886` }, new AbortController())
    await loader({ url: `${SLOPE_SCHEME}://13/1325/2886` }, new AbortController())
    expect(asked.filter((key) => key === '13/1325/2886')).toHaveLength(1)
  })
})
