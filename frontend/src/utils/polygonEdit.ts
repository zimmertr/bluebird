// Where a click belongs in the ring being drawn.
//
// Every new point used to go on the end of the array, which is fine while you
// are tracing an outline for the first time but wrong the moment the ring is
// closed: a click on the far side of the polygon connected the far side to
// whichever vertex happened to be last, and the ring crossed itself. That is
// the "impossible overlapping shapes" complaint in #118, and it is a placement
// bug rather than a gesture bug — the user pointed at an edge, and the app
// appended to a sequence.
//
// Under three points there is no ring yet, so the sequence IS the user's
// intent and a click appends. From three on, the click lands on the edge it is
// nearest to, measured as the detour it adds to that edge. That is the same
// rule the midpoint handles already follow, so dragging a midpoint and
// clicking beside it now produce the same ring.

// Longitude degrees shrink toward the poles. One cosine for the whole ring
// rather than one per segment: these distances are only ever compared against
// each other over a few kilometers, so the absolute error does not matter, but
// a scale that varied per segment would make the comparison itself inconsistent
// — a north-south edge and an east-west edge would be measured in different
// units, and the "nearest" edge could come out wrong for a point between them.
function scaledDistance(a: [number, number], b: [number, number], latScale: number): number {
  return Math.hypot((a[0] - b[0]) * latScale, a[1] - b[1])
}

/**
 * The index `pt` should be spliced into, for a ring that is already closed.
 *
 * The chosen edge is the one whose detour — the extra path length from routing
 * a→pt→b instead of a→b — is smallest. Detour rather than perpendicular
 * distance because a perpendicular can be short while its foot lies far off
 * the end of the segment, which is how a click near one edge's *extension*
 * would beat the edge it is actually beside.
 */
export function insertionIndex(pts: [number, number][], pt: [number, number]): number {
  if (pts.length < 3) return pts.length

  const lats = pts.map((p) => p[1])
  const latScale = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180)

  let bestEdge = 0
  let bestDetour = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const detour =
      scaledDistance(a, pt, latScale) +
      scaledDistance(pt, b, latScale) -
      scaledDistance(a, b, latScale)
    if (detour < bestDetour) {
      bestDetour = detour
      bestEdge = i
    }
  }
  return bestEdge + 1
}

/** The ring with `pt` placed where `insertionIndex` says it goes. */
export function addVertex(pts: [number, number][], pt: [number, number]): [number, number][] {
  const at = insertionIndex(pts, pt)
  return [...pts.slice(0, at), pt, ...pts.slice(at)]
}
