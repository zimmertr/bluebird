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
 * It is also the least a reader's drag leaves a body (`dragBodyRange`).
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

/**
 * The room a card has where it stands (TJ, 2026-11-04): MapLibre centres a
 * card on its point, so it can widen only as far as its nearer side of the
 * visible map allows, twice that distance less the fit's breath at both
 * edges; and it hangs on one side of its point, so it can grow only as far
 * as that side's edge, less the tip and the breath. A reader's drag stops
 * here, where the card would otherwise run off the map and under the panel
 * or the results, which no fit could then bring back without moving the
 * card off its point.
 */
export function standingRoom(marker: Point, anchor: PopupSide, region: Rect): Size {
  const width = 2 * Math.min(marker.x - region.left, region.right - marker.x) - 2 * FIT_MARGIN_PX
  const height =
    anchor === 'top'
      ? region.bottom - FIT_MARGIN_PX - (marker.y + TIP_PX)
      : marker.y - TIP_PX - (region.top + FIT_MARGIN_PX)
  return { width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) }
}

/**
 * The heights a reader's drag stands a body between on the visible map
 * `region`, for a card whose header and tip are `chrome` tall, whose body
 * holds `content` of its own, and which has `room` of height where it stands
 * (`standingRoom`).
 *
 * The least is the floor the app caps a body by (`bodyBounds`, TJ
 * 2026-11-04), since a body much shorter cuts its rows mid-line and is no
 * size to read a card at. A body that holds less than the floor stops at its
 * own height instead, since under it there is nothing to scroll into. The
 * most is the room the card has on its side of its point less its header,
 * and never more than the free map's height, the region less the fit's
 * breath at both edges, the marker's half square and the tip: past the
 * content's own height the body stands taller than what it holds, with the
 * card's surface under its last section, but never past the map's edge
 * (TJ, 2026-11-04). The ceiling bounds only the app's cap.
 *
 * A map with no visible height, a sheet standing over all of it, has
 * nothing to size a body to, so the body stands at its content, as
 * `openingBodyCap` leaves it whole.
 */
export function dragBodyRange(
  region: Rect,
  chrome: number,
  content: number,
  room = Number.POSITIVE_INFINITY,
): { min: number; max: number } {
  const height = Math.max(0, region.bottom - region.top)
  if (height === 0) return { min: content, max: content }
  const min = Math.min(content, bodyBounds(region).floor)
  const free = Math.floor(height - 2 * FIT_MARGIN_PX - MARKER_HALF_PX - TIP_PX - chrome)
  const most = Math.min(free, Math.floor(room - chrome))
  return { min, max: Math.max(min, most) }
}

/**
 * The size a reader's drag may take a card to, of the `size` it asks for,
 * so the card stays clear of what stands over the map (TJ, 2026-11-04): a
 * card dragged under the scale or the credits has its corner, and the handle
 * in it, under them, and cannot be dragged back. Each of `obstacles` the
 * card would reach, the fit's breath included, stops the side the drag
 * pushed into it: the width where widening alone from `start` reaches it, as
 * a legend beside the card, the height where growing taller alone does, as
 * the scale under it, so widening a card never makes it shorter. One only
 * the two together reach, at the card's corner, takes off whichever leaves
 * the card more. Never under `least`; one the card cannot clear at `least`
 * is left alone. The caller leaves out what the card already stands over as
 * the drag starts, so a drag never shrinks a card on its first move. Every
 * size here is the popup's whole box, its tip included, as the caller
 * measures it, so the tip is not added again: counted twice, it stopped a
 * drag 18px over the scale rather than 8.
 */
export function clearSize(
  marker: Point,
  anchor: PopupSide,
  start: Size,
  size: Size,
  least: Size,
  obstacles: readonly Rect[],
): Size {
  let { width, height } = size
  const reach = (w: number, h: number) =>
    figureOf(marker, { width: w + 2 * FIT_MARGIN_PX, height: h + FIT_MARGIN_PX }, anchor, 0)
  for (const o of obstacles) {
    if (overlap(reach(width, height), o) === 0) continue
    const wide = overlap(reach(width, Math.min(height, start.height)), o) > 0
    const tall = overlap(reach(Math.min(width, start.width), height), o) > 0
    const lower =
      anchor === 'top' ? o.top - FIT_MARGIN_PX - marker.y : marker.y - (o.bottom + FIT_MARGIN_PX)
    const narrower =
      o.left > marker.x
        ? 2 * (o.left - FIT_MARGIN_PX - marker.x)
        : o.right < marker.x
          ? 2 * (marker.x - o.right - FIT_MARGIN_PX)
          : -1
    const byHeight = lower >= least.height
    const byWidth = narrower >= least.width
    if (wide && byWidth) width = Math.floor(narrower)
    if (tall && byHeight) height = Math.floor(lower)
    if (wide || tall) continue
    if (byHeight && (!byWidth || width * lower >= narrower * height)) height = Math.floor(lower)
    else if (byWidth) width = Math.floor(narrower)
  }
  return { width, height }
}

/** How long after the map last took a wheel a wheel over a card is still that zoom's (`wheelIsTheMaps`). */
export const WHEEL_GESTURE_MS = 400

/**
 * Whether a wheel over a card is the map's to zoom by (TJ, 2026-11-04). A
 * card rides its point, so a zoom out draws it under the cursor, and the
 * wheel then landed on the card and the zoom stopped dead. The map takes it
 * while a zoom is under way, `sinceMapWheelMs` since the map's last wheel
 * being inside `WHEEL_GESTURE_MS`; always for a pinch, which a browser sends
 * as a wheel with Ctrl held and would otherwise zoom the page by; and
 * wherever the card has nothing to scroll under the cursor. A wheel that
 * starts on a body with more to show scrolls it.
 */
export function wheelIsTheMaps(wheel: { pinch: boolean; sinceMapWheelMs: number; scrolls: boolean }): boolean {
  return wheel.pinch || wheel.sinceMapWheelMs < WHEEL_GESTURE_MS || !wheel.scrolls
}

/**
 * The height to cap a card's body at as it opens, or null where the body
 * stands whole: the fit's cap (`capHeight`) under the ceiling, never under
 * the floor. `size` is the whole card as built and `body` its body's height
 * in it. A card opened at the height a reader dragged to is not capped here:
 * its body stands at that height (`openCard` in `map/mapPopups.ts`).
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
): number | null {
  if (region.bottom <= region.top) return null
  const bounds = bodyBounds(region)
  const top = Math.min(body, bounds.ceiling)
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
 * included. The cap is what fits, under the ceiling and never under the
 * floor; `pan` is how far the card still runs past the edge at that cap,
 * which the map moves to bring into view rather than cutting the body under
 * the floor. Null where the body stands whole, or where the map has no
 * visible height (`openingBodyCap`). A card at a reader's height never grows
 * and is never asked.
 */
export function grownBodyCap(body: number, over: number, region: Rect): { cap: number | null; pan: number } {
  if (region.bottom <= region.top) return { cap: null, pan: 0 }
  const bounds = bodyBounds(region)
  const top = Math.min(body, bounds.ceiling)
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
