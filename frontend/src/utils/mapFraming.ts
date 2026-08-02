/**
 * Whether the camera already shows something, so a framing move can be skipped.
 *
 * Split out of `MapView` because that component has no test at all: Vitest runs
 * with no DOM here and MapLibre needs a canvas, so the only way this predicate
 * gets covered is by taking the projection as input rather than doing it.
 */

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
