import { PbfWriter } from 'pbf'

/**
 * A Mapbox Vector Tile built in a test: the smallest writer that
 * `glacierCell.ts` can read, so the glacier check is tested against bytes
 * shaped like the live host's rather than against a hand-made object.
 * Polygons, which the `landcover` layer's glaciers are (#748). The field
 * numbers and the geometry commands are the specification's
 * (vector_tile.proto, version 2).
 */

/** A polygon: its rings in tile units, each without its closing repeat. */
export interface MvtPolygon {
  id?: number
  rings: (readonly [number, number])[][]
  properties: Record<string, string | number | boolean>
}

export interface MvtLayer {
  name: string
  extent?: number
  polygons?: MvtPolygon[]
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

// A polygon's commands: per ring a MoveTo (command 1, count 1, packed as 9),
// a LineTo over the rest and a ClosePath (command 7, count 1, packed as 15),
// every coordinate a zigzag-encoded delta from the cursor, which carries over
// from one ring to the next.
function polygonCommands(rings: MvtPolygon['rings']): number[] {
  const out: number[] = []
  let cx = 0
  let cy = 0
  for (const ring of rings) {
    ring.forEach(([x, y], i) => {
      if (i === 0) out.push(9)
      if (i === 1) out.push(2 | ((ring.length - 1) << 3))
      out.push(zigzag(x - cx), zigzag(y - cy))
      cx = x
      cy = y
    })
    out.push(15)
  }
  return out
}

function writePolygon({ polygon, tags }: { polygon: MvtPolygon; tags: number[] }, pbf: PbfWriter) {
  if (polygon.id !== undefined) pbf.writeVarintField(1, polygon.id)
  pbf.writePackedVarint(2, tags)
  // Geometry type 3 is a polygon.
  pbf.writeVarintField(3, 3)
  pbf.writePackedVarint(4, polygonCommands(polygon.rings))
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
  const tagsOf = (properties: Record<string, Value>) =>
    Object.entries(properties).flatMap(([k, v]) => [indexOf(keys, k), indexOf(values, v)])
  for (const polygon of layer.polygons ?? []) pbf.writeMessage(2, writePolygon, { polygon, tags: tagsOf(polygon.properties) })
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
