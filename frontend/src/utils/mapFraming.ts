/**
 * The decisions behind a framing move: what a link's opening frame covers,
 * whether to make a move at all, and how much of the container the camera has
 * to leave empty.
 *
 * Split out of `MapView` because that component has no test at all: MapLibre
 * needs a WebGL canvas, which jsdom does not provide, so the only way either gets
 * covered is by taking the projection and the measurements as input rather than
 * reading them off a map.
 */

import type { Place } from './geocode'
import { parseCustomCsv } from './customDestinations'

/**
 * Every point destination a shared link restores, as one list for the opening
 * frame: the pasted CSV rows first, then the searched places, in URL order.
 *
 * The opening frame must union every restored input, or a link carrying only
 * one kind opens on the default camera (#502, where searched places were
 * skipped). The union lives here rather than in `MapView` because that
 * component cannot be tested, and this is the part that can be wrong. The
 * polygon is not in it: `MapView` reads the ring from `restoredPolygonRef`,
 * which a Clear pressed before `load` can empty (#453).
 */
export function restoredFramePoints(
  customCsv: string,
  pins: Place[],
): { latitude: number; longitude: number }[] {
  return [
    ...parseCustomCsv(customCsv).map(({ latitude, longitude }) => ({ latitude, longitude })),
    ...pins.map(({ lat, lon }) => ({ latitude: lat, longitude: lon })),
  ]
}

/**
 * Is every one of these already-projected points comfortably inside the canvas?
 *
 * Screen pixels rather than a `getBounds()` comparison in degrees, because
 * `getBounds()` returns the bounding box of the viewport, which is a superset
 * of it as soon as the map is rotated or pitched — a shape sitting in that
 * surplus would be reported visible while being off screen. Projected vertices
 * are exact under any camera, and they are the ring itself rather than its
 * bounding box, so a diagonal shape is not judged by corners it does not
 * occupy.
 *
 * `inset` is the comfort margin: a vertex one pixel inside the edge is
 * technically visible and not usefully so. It is capped at a quarter of each
 * axis so that a small canvas keeps at least half of itself as interior; an
 * uncapped 60px inset on a 100px-wide map leaves no interior at all and would
 * answer "not framed" for every possible shape.
 *
 * An empty list answers false. Callers guard on having a shape at all, and
 * "there is nothing to frame" is not a claim that the camera is already right.
 */
export function pointsWithinView(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  inset: number,
): boolean {
  if (points.length === 0) return false
  const padX = Math.min(inset, width / 4)
  const padY = Math.min(inset, height / 4)
  return points.every(
    (p) => p.x >= padX && p.x <= width - padX && p.y >= padY && p.y <= height - padY,
  )
}

/** How much of each edge of the map a framing move must leave clear. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * A framing call's inset, with the results sheet's share of the bottom edge
 * added to it (#249), and whatever else stands over the map (`extra`: the
 * tutorial's card, #536).
 *
 * Every `fitBounds` in `MapView` takes the object form, which MapLibre bakes
 * into the computed centre and zoom and then drops — so the padding never
 * becomes camera state that a later fit would count twice.
 *
 * The sheet stands on the container's bottom edge and the camera frames into
 * the whole container, so the lift is added to that one edge and to no other.
 * Something else standing on the same edge is covering the same map, so the
 * edge keeps clear of whichever of the two reaches higher, not of their sum.
 */
export function framePadding(
  inset: number,
  bottomPx: number,
  extra: Insets = NO_INSETS,
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: inset + extra.top,
    right: inset + extra.right,
    bottom: inset + Math.max(bottomPx, extra.bottom),
    left: inset + extra.left,
  }
}

/**
 * Where a centring move puts its subject, as MapLibre's `offset` from the
 * container's centre: the middle of the map left clear by the sheet and by
 * `extra`, counted the way `framePadding` counts them.
 *
 * An offset rather than a padding for the reason `focusResult` gives: a
 * padding handed to `flyTo` is interpolated onto the transform and stays there.
 */
export function centerOffset(bottomPx: number, extra: Insets = NO_INSETS): [number, number] {
  return [(extra.left - extra.right) / 2, (extra.top - Math.max(bottomPx, extra.bottom)) / 2]
}

/**
 * Insets held to a third of their axis each, so a third of the map at least
 * is left to frame into. MapLibre gives up on a fit whose padding is wider
 * than its canvas, which the tutorial's card alone comes close to on a phone.
 */
export function clampInsets(insets: Insets, width: number, height: number): Insets {
  const x = (v: number) => Math.round(Math.min(Math.max(0, v), width / 3))
  const y = (v: number) => Math.round(Math.min(Math.max(0, v), height / 3))
  return { top: y(insets.top), right: x(insets.right), bottom: y(insets.bottom), left: x(insets.left) }
}
