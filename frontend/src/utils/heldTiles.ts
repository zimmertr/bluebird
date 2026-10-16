/**
 * The tiles a picture on the map was drawn from, kept so the app can read
 * what was painted at a point without asking anyone (#737).
 *
 * The rain radar and the snow depth are raster layers: MapLibre turns their
 * tiles into textures and keeps no pixel a script can read. So both load
 * their tiles through a protocol of the app's own (`map/heldTileProtocol.ts`),
 * which fetches the same image MapLibre would have, hands it on, and keeps a
 * copy here. Reading the copy answers the cursor on every pointer move and
 * names a card the moment it is clicked, from the exact pixels on screen and
 * with no request: the radar's tile colours ARE its values
 * (`radarPoint.ts`), and the snow's are NOAA's legend colours
 * (`snowPoint.ts`).
 *
 * Copies are kept as the compressed image, a few KB each, and only the tiles
 * a pointer has reached are decoded, a handful at a time, because a decoded
 * 256 px tile is 256 KB and the radar loop holds six frames of them.
 */

/** One pixel of one web-mercator tile. */
export interface TilePixel {
  z: number
  x: number
  y: number
  /** The pixel inside the tile, from its top left. */
  px: number
  py: number
}

/** The tile and pixel a point falls in at a tile zoom, for tiles `size` pixels square. */
export function tilePixel(lng: number, lat: number, z: number, size: number): TilePixel {
  const n = 2 ** z
  const fx = ((lng + 180) / 360) * n
  const sin = Math.sin((lat * Math.PI) / 180)
  const fy = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n
  const x = Math.min(n - 1, Math.max(0, Math.floor(fx)))
  const y = Math.min(n - 1, Math.max(0, Math.floor(fy)))
  const pixel = (f: number, t: number) => Math.min(size - 1, Math.max(0, Math.floor((f - t) * size)))
  return { z, x, y, px: pixel(fx, x), py: pixel(fy, y) }
}

/** A decoded tile: its size and its RGBA bytes, row by row. */
export interface DecodedTile {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** Turns a held image into its pixels, exactly as the file carries them. */
export type TileDecoder = (image: Blob) => Promise<DecodedTile>

/**
 * The browser's decoder. `premultiplyAlpha: 'none'` and
 * `colorSpaceConversion: 'none'` keep the bytes the PNG carries, which is what
 * a colour lookup needs; every painted pixel measured in both layers is fully
 * opaque, where a canvas's own premultiplied storage loses nothing.
 */
export const decodeTile: TileDecoder = async (image) => {
  const bitmap = await createImageBitmap(image, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No 2D context to read a held tile')
    ctx.drawImage(bitmap, 0, 0)
    const { width, height, data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { width, height, data }
  } finally {
    bitmap.close()
  }
}

/** One pixel's red, green, blue and alpha. */
export type Rgba = readonly [number, number, number, number]

/**
 * How many zooms up a lookup climbs when the map's own tile is not held yet:
 * while a tile loads, MapLibre draws its parent scaled up, so the parent is
 * what is on screen.
 */
const PARENT_ZOOMS = 4

export interface HeldTiles {
  /** Keep a tile's image, replacing an older copy of the same tile. */
  put(layer: string, z: number, x: number, y: number, image: Blob): void
  /** Forget every tile of every layer whose name starts with `prefix`. */
  drop(prefix: string): void
  /**
   * The pixel drawn at a point, if its tile is held and already decoded; null
   * where no tile drew it, and `pending` where one did but is still being
   * decoded, which `pixel` waits for.
   */
  pixelNow(layer: string, lng: number, lat: number, tileZoom: number): Rgba | null | 'pending'
  /** The pixel drawn at a point once its tile is decoded, or null where no tile drew it. */
  pixel(layer: string, lng: number, lat: number, tileZoom: number): Promise<Rgba | null>
}

export function heldTiles({
  size,
  decode = decodeTile,
  maxHeld = 600,
  maxDecoded = 8,
}: {
  /** The tiles' size in pixels, the `tileSize` their source declares. */
  size: number
  decode?: TileDecoder
  /** How many images to keep, oldest dropped first: six radar frames of ~50 tiles fit. */
  maxHeld?: number
  /** How many decoded tiles to keep, least recently read dropped first. */
  maxDecoded?: number
}): HeldTiles {
  const held = new Map<string, Blob>()
  const decoded = new Map<string, DecodedTile>()
  const decoding = new Map<string, Promise<DecodedTile | null>>()

  const keyOf = (layer: string, z: number, x: number, y: number) => `${layer}/${z}/${x}/${y}`

  // The held tile that drew the point: the map's own zoom first, then its
  // parents, which stand in on screen while it loads.
  function locate(layer: string, lng: number, lat: number, tileZoom: number) {
    for (let z = tileZoom; z >= Math.max(0, tileZoom - PARENT_ZOOMS); z--) {
      const at = tilePixel(lng, lat, z, size)
      const key = keyOf(layer, z, at.x, at.y)
      if (held.has(key)) return { key, at }
    }
    return null
  }

  function read(tile: DecodedTile, { px, py }: TilePixel): Rgba {
    // A tile the server answered at another size is read in proportion.
    const x = Math.min(tile.width - 1, Math.floor((px * tile.width) / size))
    const y = Math.min(tile.height - 1, Math.floor((py * tile.height) / size))
    const i = (y * tile.width + x) * 4
    return [tile.data[i], tile.data[i + 1], tile.data[i + 2], tile.data[i + 3]]
  }

  function remember(key: string, tile: DecodedTile) {
    decoded.delete(key)
    decoded.set(key, tile)
    while (decoded.size > maxDecoded) decoded.delete(decoded.keys().next().value!)
  }

  function decodeHeld(key: string): Promise<DecodedTile | null> {
    const ready = decoded.get(key)
    if (ready) return Promise.resolve(ready)
    const running = decoding.get(key)
    if (running) return running
    const image = held.get(key)
    if (!image) return Promise.resolve(null)
    const job = decode(image)
      .then((tile) => {
        // A copy replaced while it decoded is decoded again when next read.
        if (held.get(key) === image) remember(key, tile)
        return tile
      })
      .finally(() => decoding.delete(key))
    decoding.set(key, job)
    return job
  }

  return {
    put(layer, z, x, y, image) {
      const key = keyOf(layer, z, x, y)
      held.delete(key)
      decoded.delete(key)
      held.set(key, image)
      while (held.size > maxHeld) {
        const oldest = held.keys().next().value!
        held.delete(oldest)
        decoded.delete(oldest)
      }
    },
    drop(prefix) {
      for (const key of [...held.keys()]) {
        if (key.startsWith(prefix)) {
          held.delete(key)
          decoded.delete(key)
        }
      }
    },
    pixelNow(layer, lng, lat, tileZoom) {
      const found = locate(layer, lng, lat, tileZoom)
      if (!found) return null
      const tile = decoded.get(found.key)
      if (tile) {
        remember(found.key, tile)
        return read(tile, found.at)
      }
      void decodeHeld(found.key).catch(() => {})
      return 'pending'
    },
    async pixel(layer, lng, lat, tileZoom) {
      const found = locate(layer, lng, lat, tileZoom)
      if (!found) return null
      const tile = await decodeHeld(found.key)
      return tile ? read(tile, found.at) : null
    },
  }
}
