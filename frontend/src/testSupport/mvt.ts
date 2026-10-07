import { PbfWriter } from 'pbf'

/**
 * A Mapbox Vector Tile built in a test (#673): the smallest writer that
 * `peakTiles.ts` can read, so the tile matching is tested against bytes
 * shaped like the live host's rather than against a hand-made object. Point
 * features only, which is all the `mountain_peak` layer holds. The field
 * numbers are the specification's (vector_tile.proto, version 2).
 */

export interface MvtPoint {
  id?: number
  // Tile-local coordinates, 0 to the layer's extent.
  x: number
  y: number
  properties: Record<string, string | number | boolean>
}

export interface MvtLayer {
  name: string
  extent?: number
  points: MvtPoint[]
}

type Value = string | number | boolean

const zigzag = (n: number) => (n << 1) ^ (n >> 31)

function writeValue(v: Value, pbf: PbfWriter) {
  if (typeof v === 'string') pbf.writeStringField(1, v)
  else if (typeof v === 'boolean') pbf.writeBooleanField(7, v)
  else if (!Number.isInteger(v)) pbf.writeDoubleField(3, v)
  else if (v < 0) pbf.writeSVarintField(6, v)
  else pbf.writeVarintField(5, v)
}

function writeFeature({ point, tags }: { point: MvtPoint; tags: number[] }, pbf: PbfWriter) {
  if (point.id !== undefined) pbf.writeVarintField(1, point.id)
  pbf.writePackedVarint(2, tags)
  // Geometry type 1 is a point; the geometry is one MoveTo (command 1, count
  // 1, packed as 9) followed by the zigzag-encoded coordinates.
  pbf.writeVarintField(3, 1)
  pbf.writePackedVarint(4, [9, zigzag(point.x), zigzag(point.y)])
}

function writeLayer(layer: MvtLayer, pbf: PbfWriter) {
  const keys: string[] = []
  const values: Value[] = []
  const indexOf = <T>(list: T[], v: T) => {
    let i = list.indexOf(v)
    if (i < 0) i = list.push(v) - 1
    return i
  }
  pbf.writeVarintField(15, 2)
  pbf.writeStringField(1, layer.name)
  for (const point of layer.points) {
    const tags: number[] = []
    for (const [k, v] of Object.entries(point.properties)) tags.push(indexOf(keys, k), indexOf(values, v))
    pbf.writeMessage(2, writeFeature, { point, tags })
  }
  for (const k of keys) pbf.writeStringField(3, k)
  for (const v of values) pbf.writeMessage(4, writeValue, v)
  pbf.writeVarintField(5, layer.extent ?? 4096)
}

/** The tile's bytes. */
export function encodeTile(layers: readonly MvtLayer[]): Uint8Array {
  const pbf = new PbfWriter()
  for (const layer of layers) pbf.writeMessage(3, writeLayer, layer)
  return pbf.finish()
}
