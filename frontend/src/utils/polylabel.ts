// The point inside a polygon furthest from any edge — its "pole of
// inaccessibility" (#119).
//
// A lake needs one coordinate to be a destination, and for the big lakes the
// label is drawn along a line rather than anchored to a point, so there is no
// coordinate to read off the feature. The obvious answer, the centroid, is
// wrong for exactly the lakes that need it: the centroid of a bent lake like
// Lake Washington sits on the far shore, and the centroid of a horseshoe sits
// on dry land in the middle. Nudging such a point to the nearest shoreline
// only trades "outside the lake" for "on its edge".
//
// So: the interior point maximizing distance to the boundary. It is guaranteed
// inside, it is stable under small changes to the outline, and for a lake it
// lands where you would point at if asked to pick the middle of the water.
//
// This is Mapbox's polylabel algorithm — a quadtree search that repeatedly
// splits the most promising cell and prunes any cell whose best possible score
// cannot beat the incumbent. Cost is a few hundred distance evaluations for a
// lake, not a scan of the polygon's area, which is what makes it cheap enough
// to run on a click.
//
// Coordinates are treated as a plane. Over a single lake the longitude
// distortion is a constant factor, and a constant scale cannot move which
// interior point is furthest from the edge by anything that matters here.

export type Ring = [number, number][]

interface Cell {
  x: number
  y: number
  /** Half the cell's width: the cell spans [x-h, x+h] × [y-h, y+h]. */
  h: number
  /** Signed distance from the cell's center to the polygon boundary. */
  d: number
  /** The best distance any point in this cell could have. */
  max: number
}

// Squared distance from p to segment ab, kept squared until the caller needs
// a real distance so the inner loop takes no square roots.
function segDistSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  let x = ax
  let y = ay
  let dx = bx - ax
  let dy = by - ay

  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = bx
      y = by
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }

  dx = px - x
  dy = py - y
  return dx * dx + dy * dy
}

/**
 * Distance from (x, y) to the polygon's boundary, positive inside and negative
 * outside. One pass does both: the even-odd crossing test that decides the
 * sign, and the running minimum that gives the magnitude.
 */
export function signedDistance(x: number, y: number, rings: Ring[]): number {
  let inside = false
  let minSq = Infinity

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]
      const b = ring[j]
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        inside = !inside
      }
      minSq = Math.min(minSq, segDistSq(x, y, a[0], a[1], b[0], b[1]))
    }
  }

  if (minSq === Infinity) return 0
  return (inside ? 1 : -1) * Math.sqrt(minSq)
}

function makeCell(x: number, y: number, h: number, rings: Ring[]): Cell {
  const d = signedDistance(x, y, rings)
  // A cell's ceiling is its center's distance plus the furthest its corner can
  // reach. Pruning on this is what keeps the search from exploring the whole
  // polygon.
  return { x, y, h, d, max: d + h * Math.SQRT2 }
}

// The area-weighted centroid, used only as an opening guess. Degenerate
// (zero-area) rings fall back to the first vertex.
function centroidCell(rings: Ring[]): Cell {
  let area = 0
  let x = 0
  let y = 0
  const ring = rings[0]

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const f = a[0] * b[1] - b[0] * a[1]
    x += (a[0] + b[0]) * f
    y += (a[1] + b[1]) * f
    area += f * 3
  }

  if (area === 0) return makeCell(ring[0][0], ring[0][1], 0, rings)
  return makeCell(x / area, y / area, 0, rings)
}

// A binary max-heap keyed on `max`. An array with a linear scan for the best
// cell would make the search quadratic in the number of cells, which is the
// one way this algorithm gets slow.
class MaxHeap {
  private items: Cell[] = []

  get size(): number {
    return this.items.length
  }

  push(cell: Cell): void {
    const items = this.items
    items.push(cell)
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (items[parent].max >= items[i].max) break
      ;[items[parent], items[i]] = [items[i], items[parent]]
      i = parent
    }
  }

  pop(): Cell | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0 && last !== undefined) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let best = i
        if (l < items.length && items[l].max > items[best].max) best = l
        if (r < items.length && items[r].max > items[best].max) best = r
        if (best === i) break
        ;[items[best], items[i]] = [items[i], items[best]]
        i = best
      }
    }
    return top
  }
}

/**
 * The pole of whichever polygon has the roomiest interior.
 *
 * A lake reaches us as however many pieces of it are currently drawn: a
 * multipolygon in the data, and split again wherever it crosses a tile
 * boundary. Poling the pieces separately and keeping the widest is what makes
 * that safe — concatenating their rings into one polygon would have the
 * even-odd test read one piece's outline as another's hole.
 *
 * Returns null for no polygons at all, which is the caller's cue to fall back
 * to whatever coordinate it already had.
 */
export function widestPole(polygons: Ring[][], precision?: number): [number, number] | null {
  let best: [number, number] | null = null
  let bestClearance = -Infinity

  for (const rings of polygons) {
    if (!rings[0]?.length) continue
    const pole = poleOfInaccessibility(rings, precision)
    const clearance = signedDistance(pole[0], pole[1], rings)
    if (clearance > bestClearance) {
      bestClearance = clearance
      best = pole
    }
  }

  return best
}

/**
 * @param rings Outer ring first, holes after. Rings need not be closed.
 * @param precision How close to optimal is close enough, in the same units as
 * the coordinates. The default is ~1 m in degrees of latitude, far finer than
 * a weather grid cell and fine enough that the dot lands where the eye expects.
 */
export function poleOfInaccessibility(rings: Ring[], precision = 1e-5): [number, number] {
  const outer = rings[0]
  if (!outer || outer.length === 0) return [0, 0]

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of outer) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  const width = maxX - minX
  const height = maxY - minY
  const cellSize = Math.min(width, height)
  // A ring with no extent in one axis has no interior to be inside of.
  if (cellSize === 0) return [minX, minY]

  const h = cellSize / 2
  const queue = new MaxHeap()
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, rings))
    }
  }

  let best = centroidCell(rings)
  const bboxCenter = makeCell(minX + width / 2, minY + height / 2, 0, rings)
  if (bboxCenter.d > best.d) best = bboxCenter

  while (queue.size > 0) {
    const cell = queue.pop()
    if (!cell) break

    if (cell.d > best.d) best = cell
    // Nothing in this cell can beat the incumbent by enough to care about.
    if (cell.max - best.d <= precision) continue

    const half = cell.h / 2
    queue.push(makeCell(cell.x - half, cell.y - half, half, rings))
    queue.push(makeCell(cell.x + half, cell.y - half, half, rings))
    queue.push(makeCell(cell.x - half, cell.y + half, half, rings))
    queue.push(makeCell(cell.x + half, cell.y + half, half, rings))
  }

  return [best.x, best.y]
}
