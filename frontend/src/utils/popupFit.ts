/**
 * Where a map popup stands once it is open (TJ, 2026-09-29): the map moves so
 * the card shows as much of itself as it can, rather than unfurling above or
 * below its marker wherever the marker happened to rest and running under the
 * results sheet, off the top of the map, or behind the button column.
 *
 * Everything here is in the map container's pixels. A `Rect` is a box on the
 * map, the popup's `region` is the part of the map a card can be seen in (the
 * container above the results sheet), and an obstacle is something standing
 * over the map inside that region (the button column at its top left, the
 * tutorial's card along a phone's bottom edge). The answer is a side for the
 * card and a move for the map: how far the marker, and the card with it, must
 * shift on the screen.
 *
 * Pure, so the node project can pin it; the map module converts the pixels.
 */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/**
 * MapLibre's anchor names, which say where the MARKER is on the card: `top`
 * hangs the card below its marker, `bottom` stands it above.
 */
export type PopupSide = 'top' | 'bottom'

export interface Placement {
  anchor: PopupSide
  /** How far the marker moves across the screen, right and down. */
  dx: number
  dy: number
}

/** MapLibre's default tip: the triangle between the card and its marker. */
export const TIP_PX = 10
/** Breath between the card, or its marker, and any edge it is fitted to. */
export const FIT_MARGIN_PX = 8
/** Half the square a marker needs around itself to read as the card's subject. */
const MARKER_HALF_PX = 8

/** The card and its marker together, standing on the given side of the marker. */
export function figureOf(marker: Point, size: Size, anchor: PopupSide, tip = TIP_PX): Rect {
  const left = marker.x - size.width / 2
  const right = marker.x + size.width / 2
  return anchor === 'top'
    ? { left, right, top: marker.y - MARKER_HALF_PX, bottom: marker.y + tip + size.height }
    : { left, right, top: marker.y - tip - size.height, bottom: marker.y + MARKER_HALF_PX }
}

function shifted(r: Rect, dx: number, dy: number): Rect {
  return { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

function clip(a: Rect, b: Rect): Rect {
  return {
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    top: Math.max(a.top, b.top),
    bottom: Math.min(a.bottom, b.bottom),
  }
}

/**
 * How much of `rect` a reader would see: what lies inside the region, less
 * what an obstacle in the region covers. Obstacles are taken as disjoint,
 * which the column and the card are.
 */
export function visibleArea(rect: Rect, region: Rect, obstacles: readonly Rect[]): number {
  const inside = overlap(rect, region)
  if (inside === 0) return 0
  const seen = clip(rect, region)
  return obstacles.reduce((area, o) => area - overlap(seen, o), inside)
}

/**
 * The move along one axis that brings a span inside an edge pair with the
 * margin kept: the near edge first when both cannot hold, because the top
 * of a card is its title and the left of it is where its lines start.
 */
function fitAxis(lo: number, hi: number, edgeLo: number, edgeHi: number, margin: number): number {
  if (lo < edgeLo + margin) return edgeLo + margin - lo
  if (hi > edgeHi - margin) return Math.max(edgeHi - margin - hi, edgeLo + margin - lo)
  return 0
}

/** The move that puts a figure inside the region, near edges first. */
function intoRegion(figure: Rect, region: Rect, margin: number): Point {
  return {
    x: fitAxis(figure.left, figure.right, region.left, region.right, margin),
    y: fitAxis(figure.top, figure.bottom, region.top, region.bottom, margin),
  }
}

/**
 * The move that shows the most of a figure. The plain fit into the region is
 * one candidate; for each obstacle, stepping clear of it on each of its four
 * sides and then fitting again is four more. The candidate with the most of
 * the figure in view wins, the shorter move breaking a tie, so a card steps
 * sideways past the column on a desktop, where the map is wide enough, and
 * drops below it on a phone, where it is not.
 */
export function fitPan(figure: Rect, region: Rect, obstacles: readonly Rect[], margin = FIT_MARGIN_PX): Point {
  const base = intoRegion(figure, region, margin)
  const candidates: Point[] = [base]
  for (const o of obstacles) {
    const at = shifted(figure, base.x, base.y)
    for (const step of [
      { x: o.right + margin - at.left, y: 0 },
      { x: o.left - margin - at.right, y: 0 },
      { x: 0, y: o.bottom + margin - at.top },
      { x: 0, y: o.top - margin - at.bottom },
    ]) {
      const moved = shifted(at, step.x, step.y)
      const back = intoRegion(moved, region, margin)
      candidates.push({ x: base.x + step.x + back.x, y: base.y + step.y + back.y })
    }
  }
  let best = candidates[0]
  let bestArea = -1
  for (const c of candidates) {
    const area = visibleArea(shifted(figure, c.x, c.y), region, obstacles)
    const shorter = Math.abs(c.x) + Math.abs(c.y) < Math.abs(best.x) + Math.abs(best.y)
    if (area > bestArea || (area === bestArea && shorter)) {
      best = c
      bestArea = area
    }
  }
  return best
}

/**
 * The side and the move for a card of this size on a marker standing here.
 * Both sides are tried, each with its best move, and the one that shows more
 * of the card wins; a tie goes to the shorter move, then to hanging below,
 * which puts the title first when the card is taller than the map.
 */
export function placePopup(marker: Point, size: Size, region: Rect, obstacles: readonly Rect[] = []): Placement {
  let best: Placement | null = null
  let bestArea = -1
  for (const anchor of ['top', 'bottom'] as const) {
    const figure = figureOf(marker, size, anchor)
    const pan = fitPan(figure, region, obstacles)
    const area = visibleArea(shifted(figure, pan.x, pan.y), region, obstacles)
    const shorter =
      best !== null && Math.abs(pan.x) + Math.abs(pan.y) < Math.abs(best.dx) + Math.abs(best.dy)
    if (area > bestArea || (area === bestArea && shorter)) {
      best = { anchor, dx: pan.x, dy: pan.y }
      bestArea = area
    }
  }
  return best!
}
