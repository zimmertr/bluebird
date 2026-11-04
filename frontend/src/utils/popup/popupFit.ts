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

import { clamp } from '../numbers'

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

/** How long a card's pan takes: short, because the reader is waiting on the card it opens. */
export const POPUP_PAN_MS = 300

/** MapLibre's default tip: the triangle between the card and its marker. */
const TIP_PX = 10
/** Breath between the card, or its marker, and any edge it is fitted to. */
export const FIT_MARGIN_PX = 8
/** Half the square a marker needs around itself to read as the card's subject. */
const MARKER_HALF_PX = 8
/**
 * How far apart two areas may be and still be one, in square pixels. A point
 * MapLibre projects after a flight carries noise in its last digits
 * (416.5000000000477 for 416.5), and an exact comparison let that noise
 * outweigh a whole card's worth of tie: a card that showed whole on either
 * side turned to the side 42px away (measured 2026-11-04).
 */
const AREA_SLOP = 0.5

/** Whether a candidate that shows `area` beats the best so far, the shorter move breaking a tie. */
function better(area: number, bestArea: number, shorter: boolean): boolean {
  return area > bestArea + AREA_SLOP || (Math.abs(area - bestArea) <= AREA_SLOP && shorter)
}

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
    if (better(area, bestArea, shorter)) {
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
    if (better(area, bestArea, shorter)) {
      best = { anchor, dx: pan.x, dy: pan.y }
      bestArea = area
    }
  }
  return best!
}

/**
 * The most of the visible map's height a card's body may take, even where the
 * map has room for all of it (TJ, 2026-11-03): past this share a tall card
 * scrolls under its header, so a card never fills a tall map and covers the
 * markers around its own.
 */
export const BODY_CEILING_SHARE = 0.75

/**
 * The least of the visible map's height a capped body keeps (TJ, 2026-11-03),
 * the ceiling's mirror, so a cap never leaves a keyhole to scroll through. It
 * replaced two fixed numbers, a 200px card floor at open and a 48px body
 * floor for a card that grew, with one share that follows the map's height.
 * Where the fit cannot give a body this much where its card stands, the card
 * keeps it and the map pans, as it does for any card that does not fit.
 */
export const BODY_FLOOR_SHARE = 0.25

/** The heights a card's body stands between on a map whose visible part is `region`. */
export interface BodyBounds {
  floor: number
  ceiling: number
}

/** The body's floor and ceiling, in whole pixels, for the visible map `region` (`regionNow` in `map/mapPopups.ts`). */
export function bodyBounds(region: Rect): BodyBounds {
  const height = Math.max(0, region.bottom - region.top)
  return { floor: Math.floor(height * BODY_FLOOR_SHARE), ceiling: Math.floor(height * BODY_CEILING_SHARE) }
}

/** A body height held between the bounds: what a reader's drag or a remembered size may set. */
export function boundBody(px: number, { floor, ceiling }: BodyBounds): number {
  return clamp(px, floor, ceiling)
}

/**
 * The height to cap a card's body at as it opens, or null where the body
 * stands whole: the fit's cap (`capHeight`) under the ceiling, never under
 * the floor. `size` is the whole card as built and `body` its body's height
 * in it; `roof` is the body height a reader chose by dragging (`map/destinationCards.ts`),
 * which stands in for the ceiling under it and is held between the bounds.
 *
 * A body the fit cannot give the floor where its card stands keeps the floor
 * all the same, and `placePopup` then finds the card too tall to stand whole
 * and pans the map title first, as it does for any card that does not fit.
 * A body shorter than the floor is never capped, and pans the same way.
 * Nor is any body on a map with no visible height, a sheet standing over all
 * of it, where there is nothing to fit a card to and a ceiling of nothing
 * would leave it a header.
 */
export function openingBodyCap(
  marker: Point,
  size: Size,
  body: number,
  region: Rect,
  obstacles: readonly Rect[] = [],
  roof: number | null = null,
): number | null {
  if (region.bottom <= region.top) return null
  const bounds = bodyBounds(region)
  const top = Math.min(body, roof === null ? bounds.ceiling : boundBody(roof, bounds))
  const least = Math.min(bounds.floor, top)
  const chrome = size.height - body
  const sized = { width: size.width, height: chrome + top }
  const fit = capHeight(marker, sized, region, obstacles, chrome + least)
  const card = fit ?? (fitsWhole(marker, sized, region, obstacles) ? sized.height : chrome + least)
  const cap = card - chrome
  return cap < body ? cap : null
}

/**
 * The cap for a body that grew after its card opened (#832), where the card
 * stands: `body` is the body's height now and `over` how far the card runs
 * past the visible map's edge on the side it hangs, the fit's breath
 * included. The cap is what fits, under the ceiling (or the reader's `roof`)
 * and never under the floor; `pan` is how far the card still runs past the
 * edge at that cap, which the map moves to bring into view rather than
 * cutting the body under the floor. Null where the body stands whole, or
 * where the map has no visible height (`openingBodyCap`).
 */
export function grownBodyCap(
  body: number,
  over: number,
  region: Rect,
  roof: number | null = null,
): { cap: number | null; pan: number } {
  if (region.bottom <= region.top) return { cap: null, pan: 0 }
  const bounds = bodyBounds(region)
  const top = Math.min(body, roof === null ? bounds.ceiling : boundBody(roof, bounds))
  const room = body - Math.max(0, over)
  const cap = clamp(room, Math.min(bounds.floor, top), top)
  return { cap: cap < body ? cap : null, pan: Math.max(0, cap - room) }
}

/** Does a card of this size, placed as well as it can be, show all of itself? */
export function fitsWhole(marker: Point, size: Size, region: Rect, obstacles: readonly Rect[] = []): boolean {
  const placed = placePopup(marker, size, region, obstacles)
  const figure = shifted(figureOf(marker, size, placed.anchor), placed.dx, placed.dy)
  const whole = (figure.right - figure.left) * (figure.bottom - figure.top)
  return visibleArea(figure, region, obstacles) >= whole - 0.5
}

/**
 * The height to cap a card at so that it stands whole in the free map area
 * (TJ, 2026-10-08), or null when it already does, or when no card of at least
 * `min` would; `openingBodyCap` hands it the card whose body stands at the
 * floor. The caller scrolls whatever the cap cuts off.
 *
 * Found by bisection over whole pixels: a shorter card never fits worse than a
 * taller one of the same width, so the answer is one edge.
 */
export function capHeight(
  marker: Point,
  size: Size,
  region: Rect,
  obstacles: readonly Rect[],
  min: number,
): number | null {
  if (fitsWhole(marker, size, region, obstacles)) return null
  const at = (height: number) => fitsWhole(marker, { width: size.width, height }, region, obstacles)
  if (min >= size.height || !at(min)) return null
  let lo = min
  let hi = Math.floor(size.height)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (at(mid)) lo = mid
    else hi = mid
  }
  return lo
}
