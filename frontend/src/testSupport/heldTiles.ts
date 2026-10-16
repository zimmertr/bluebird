import { heldTiles, tilePixel, type DecodedTile, type HeldTiles, type Rgba } from '../utils/heldTiles'

// A tile of one colour, as the decoder would hand it back.
export function solidTile(size: number, rgba: Rgba): DecodedTile {
  const data = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i)
  return { width: size, height: size, data }
}

// A store holding one tile under a point, at a tile zoom, that decodes to a
// single colour, for a test of what a picture painted there without a
// browser to decode a PNG. The decoder counts its calls.
export function storeHolding(
  { size, layer, lng, lat, z, rgba }: { size: number; layer: string; lng: number; lat: number; z: number; rgba: Rgba },
): HeldTiles & { decodes: () => number } {
  let decodes = 0
  const tiles = heldTiles({
    size,
    decode: async () => {
      decodes++
      return solidTile(size, rgba)
    },
  })
  const { x, y } = tilePixel(lng, lat, z, size)
  tiles.put(layer, z, x, y, new Blob(['png']))
  return Object.assign(tiles, { decodes: () => decodes })
}
