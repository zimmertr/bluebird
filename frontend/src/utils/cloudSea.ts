/**
 * The cloud sea (record 0309): the cloud deck the report already fetched,
 * drawn on the ground at one hour, so a valley under a marine layer reads
 * white and the summits that stand above it read clear.
 *
 * Nothing here asks anything of anyone. The deck's base and top at each
 * destination are the hourly series every analysis carries (`cloud_deck_ft`,
 * `cloud_top_ft`, record 0305); between destinations they are interpolated,
 * and the ground's height under each pixel is the elevation tile the relief
 * and the slope read. A pixel is painted by where the ground stands against
 * the deck there: inside it, near white; under it, a light veil; above its
 * top, nothing.
 *
 * A dry column reads its base and top at the ceiling (record 0113), which is
 * no deck at all, so it is never averaged into a neighbour's: the base and
 * top are interpolated among the destinations in cloud alone, and how many
 * of the nearby destinations are in cloud (`share`) fades the edge where the
 * deck ends. Far from every destination there is nothing to say, and nothing
 * is painted.
 */
import { CLOUD_DECK_CEILING_FT } from './openMeteoAggregate'
import { FEET_PER_METER } from './basemapPoi'
import type { Theme } from './viewPrefs'
import { clamp } from './numbers'

/** One destination's deck at the hour drawn. */
export interface DeckPoint {
  lon: number
  lat: number
  /** The deck's base and top in feet, or null where the hour has none. */
  baseFt: number | null
  topFt: number | null
}

/** The deck interpolated at one place. */
export interface DeckAt {
  baseFt: number
  topFt: number
  /** How much of the nearby weight is in cloud, 0 to 1. */
  share: number
  /** How near the nearest destination is, 1 on top of it and 0 at `REACH_KM`. */
  reach: number
}

/**
 * How far from a destination its deck is spoken for. 30 km is a valley and
 * the ridges either side of it in the Cascades; past it a marine layer in one
 * drainage says nothing about the next.
 */
export const REACH_KM = 30

/**
 * The height over which the deck's top and base fade, so a top at 4,800 ft
 * does not cut the slopes along one contour. 350 ft is the prototype's, read
 * against the relief at zoom 10 and 12.
 */
export const EDGE_FT = 350

/** How opaque the ground is inside the deck and under it, by theme: the light map's pale relief takes more. */
export const CLOUD_ALPHA: Readonly<Record<Theme, { inside: number; under: number }>> = {
  dark: { inside: 0.62, under: 0.22 },
  light: { inside: 0.86, under: 0.3 },
}

/** The cloud's colour, by theme: a cool grey on the dark map, white on the light one. A canvas channel, so a pair here (root CLAUDE.md). */
export const CLOUD_RGB: Readonly<Record<Theme, readonly [number, number, number]>> = {
  dark: [196, 210, 226],
  light: [255, 255, 255],
}

const KM_PER_DEG = 111.32
const clamp01 = (v: number) => clamp(v, 0, 1)

/** Whether a destination's hour has a deck at all: a dry column reads the ceiling. */
export function inCloud(p: DeckPoint): p is DeckPoint & { baseFt: number; topFt: number } {
  return p.baseFt !== null && p.topFt !== null && p.baseFt < CLOUD_DECK_CEILING_FT
}

/** Distance in km, flat-earth, which is plenty at {@link REACH_KM}. */
function kmBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180)) * KM_PER_DEG
  const dy = (lat2 - lat1) * KM_PER_DEG
  return Math.hypot(dx, dy)
}

/**
 * The deck at one place: base and top weighted by inverse squared distance
 * among the destinations in cloud within {@link REACH_KM}, and the share of
 * all their weight that is in cloud. Null with no destination in reach.
 */
export function deckAt(points: readonly DeckPoint[], lon: number, lat: number): DeckAt | null {
  let all = 0
  let cloudy = 0
  let base = 0
  let top = 0
  let nearest = Infinity
  for (const p of points) {
    const d = kmBetween(lon, lat, p.lon, p.lat)
    if (d >= REACH_KM) continue
    nearest = Math.min(nearest, d)
    // One kilometre added so a pixel on top of a destination is not all its.
    const w = 1 / (d * d + 1)
    all += w
    if (inCloud(p)) {
      cloudy += w
      base += w * p.baseFt
      top += w * p.topFt
    }
  }
  if (all === 0) return null
  const reach = clamp01((REACH_KM - nearest) / (REACH_KM / 3))
  if (cloudy === 0) return { baseFt: CLOUD_DECK_CEILING_FT, topFt: CLOUD_DECK_CEILING_FT, share: 0, reach }
  return { baseFt: base / cloudy, topFt: top / cloudy, share: cloudy / all, reach }
}

/**
 * How opaque the ground at `groundFt` is under the deck: nothing above the
 * top, the inside value within the deck, the under value below its base, each
 * edge faded over {@link EDGE_FT}, then faded by the share in cloud (none
 * under a quarter, whole over three quarters) and by the reach.
 */
export function cloudAlpha(groundFt: number, deck: DeckAt | null, theme: Theme): number {
  if (deck === null || deck.share === 0) return 0
  const { inside, under } = CLOUD_ALPHA[theme]
  const belowTop = clamp01((deck.topFt - groundFt) / EDGE_FT)
  const intoBase = clamp01((groundFt - (deck.baseFt - EDGE_FT)) / EDGE_FT)
  const depth = under + (inside - under) * intoBase
  const share = clamp01((deck.share - 0.25) / 0.5)
  return depth * belowTop * share * deck.reach
}

/** A tile's corners in degrees, `[west, south, east, north]`. */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z
  const lon = (tx: number) => (tx / n) * 360 - 180
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)]
}

/** Whether any destination stands within {@link REACH_KM} of a tile, so a tile far from the field asks for no elevation. */
export function tileInReach(points: readonly DeckPoint[], z: number, x: number, y: number): boolean {
  const [w, s, e, n] = tileBounds(z, x, y)
  return points.some((p) => {
    const lon = clamp(p.lon, w, e)
    const lat = clamp(p.lat, s, n)
    return kmBetween(lon, lat, p.lon, p.lat) < REACH_KM
  })
}

/**
 * The nodes the deck is interpolated at across a tile, `NODES` a side, with
 * every pixel between them read off the four around it. Interpolating at
 * every pixel would weigh every destination 262,144 times a tile.
 */
const NODES = 17

/** The heights one tile is painted from: metres, `size` a side, row-major. */
export interface TileHeights {
  readonly size: number
  readonly metres: Float32Array
}

/**
 * One tile of the cloud sea as RGBA, `size` a side: the deck interpolated at
 * a lattice of nodes across the tile and between them per pixel, against the
 * ground's height under each pixel.
 */
export function cloudRaster(
  points: readonly DeckPoint[],
  z: number,
  x: number,
  y: number,
  heights: TileHeights,
  theme: Theme,
): Uint8ClampedArray<ArrayBuffer> {
  const { size, metres } = heights
  const [w, , e] = tileBounds(z, x, y)
  // The nodes in Web Mercator rows, so a node's latitude is where its row
  // of pixels stands.
  const lonAt = (u: number) => w + (e - w) * u
  const latAt = (v: number) => {
    const t = 2 ** z
    const ty = y + v
    return (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / t))) * 180) / Math.PI
  }
  const span = NODES - 1
  const nodes: (DeckAt | null)[] = []
  for (let j = 0; j < NODES; j++) {
    for (let i = 0; i < NODES; i++) nodes.push(deckAt(points, lonAt(i / span), latAt(j / span)))
  }
  const out = new Uint8ClampedArray(size * size * 4)
  const [r, g, b] = CLOUD_RGB[theme]
  for (let py = 0; py < size; py++) {
    const v = ((py + 0.5) / size) * span
    const j0 = Math.min(span - 1, Math.floor(v))
    const fv = v - j0
    for (let px = 0; px < size; px++) {
      const u = ((px + 0.5) / size) * span
      const i0 = Math.min(span - 1, Math.floor(u))
      const fu = u - i0
      const deck = blend(
        nodes[j0 * NODES + i0],
        nodes[j0 * NODES + i0 + 1],
        nodes[(j0 + 1) * NODES + i0],
        nodes[(j0 + 1) * NODES + i0 + 1],
        fu,
        fv,
      )
      const a = cloudAlpha(metres[py * size + px] * FEET_PER_METER, deck, theme)
      if (a <= 0) continue
      const o = (py * size + px) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = Math.round(a * 255)
    }
  }
  return out
}

/**
 * The deck between four nodes. A node with no destination in reach counts as
 * a dry one out of reach, so the deck fades to nothing at the field's edge
 * rather than stopping at a node line.
 */
function blend(
  a: DeckAt | null,
  b: DeckAt | null,
  c: DeckAt | null,
  d: DeckAt | null,
  fu: number,
  fv: number,
): DeckAt | null {
  const ws = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv]
  const ds = [a, b, c, d]
  let share = 0
  let reach = 0
  let cloudy = 0
  let base = 0
  let top = 0
  for (let k = 0; k < 4; k++) {
    const at = ds[k]
    if (at === null) continue
    share += ws[k] * at.share
    reach += ws[k] * at.reach
    if (at.share > 0) {
      cloudy += ws[k]
      base += ws[k] * at.baseFt
      top += ws[k] * at.topFt
    }
  }
  if (reach === 0) return null
  if (cloudy === 0) return { baseFt: CLOUD_DECK_CEILING_FT, topFt: CLOUD_DECK_CEILING_FT, share: 0, reach }
  return { baseFt: base / cloudy, topFt: top / cloudy, share, reach }
}

/**
 * The tile's heights at `size` a side, sampled from an elevation grid of any
 * size by the nearest pixel.
 */
export function sampleHeights(grid: { width: number; height: number; data: Float32Array }, size: number): TileHeights {
  const metres = new Float32Array(size * size)
  for (let py = 0; py < size; py++) {
    const gy = Math.min(grid.height - 1, Math.floor(((py + 0.5) / size) * grid.height))
    for (let px = 0; px < size; px++) {
      const gx = Math.min(grid.width - 1, Math.floor(((px + 0.5) / size) * grid.width))
      metres[py * size + px] = grid.data[gy * grid.width + gx]
    }
  }
  return { size, metres }
}

/** Each destination's deck at hour `hour` of its series, the field the sea is drawn from. */
export function deckPoints(
  rows: readonly {
    longitude: number
    latitude: number
    series?: { cloud_deck_ft?: (number | null)[] | null; cloud_top_ft?: (number | null)[] | null } | null
  }[],
  hour: number,
): DeckPoint[] {
  return rows.map((row) => ({
    lon: row.longitude,
    lat: row.latitude,
    baseFt: row.series?.cloud_deck_ft?.[hour] ?? null,
    topFt: row.series?.cloud_top_ft?.[hour] ?? null,
  }))
}
