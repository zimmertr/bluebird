// The arithmetic behind dragging a column into a new place (#360).
//
// Split from the components for the reason `columnResize.ts` is: the DOM work
// (measuring header cells, capturing a pointer) stays where the elements are,
// and everything that decides an ANSWER lives here, because Vitest runs this
// repository in the node environment and logic left in a component is
// untestable by construction.
//
// Two surfaces reorder the same columns — the table's header row, horizontally,
// and the Columns picker's list, vertically — so everything here takes a
// one-dimensional span rather than a rectangle. The caller decides which axis
// it measured.

/**
 * How far a pointer must travel before a press becomes a drag.
 *
 * A header answers a click with a sort, so a press that does not move must
 * stay a sort. 4px is below the tremor of a deliberate click and well under
 * the travel of a deliberate drag.
 */
export const DRAG_THRESHOLD_PX = 4

/**
 * How long a finger must rest before a press becomes a drag.
 *
 * A touch has no hover and a wider tremor than a mouse, so travel alone cannot
 * separate a drag from a tap that slid. 400ms is the platform convention for a
 * long press (iOS uses ~500ms for its own, Android ~400ms) and is short enough
 * that the reader does not think nothing happened.
 */
export const LONG_PRESS_MS = 400

/** One column's extent along the axis being dragged. */
export interface ColumnSpan {
  key: string
  start: number
  end: number
}

/**
 * Which column a pointer is over.
 *
 * Clamped rather than nullable at the ends: a drag that runs past the last
 * column is aiming at the last column, and a drag that stops in the gap
 * between two is aiming at the nearer one. Returning null there would make the
 * column snap back to where it started whenever the pointer left the row,
 * which reads as the drag having failed.
 *
 * Spans are taken in the order given and are not required to touch or to be
 * sorted: the first span containing the position wins, and otherwise the
 * nearest edge does.
 */
export function keyAtPosition(spans: readonly ColumnSpan[], pos: number): string | null {
  if (spans.length === 0) return null
  for (const span of spans) {
    if (pos >= span.start && pos <= span.end) return span.key
  }
  let nearest = spans[0]
  let best = Infinity
  for (const span of spans) {
    const gap = pos < span.start ? span.start - pos : pos - span.end
    if (gap < best) {
      best = gap
      nearest = span
    }
  }
  return nearest.key
}

/**
 * Whether a press that has travelled this far, for this long, is a drag yet.
 *
 * A mouse answers to travel and a finger to time, and neither is asked the
 * other's question: a mouse held still for a second is a slow click, and a
 * finger that has slid 4px has not decided anything.
 */
export function dragBegins(
  pointerType: string,
  travelPx: number,
  heldMs: number,
): boolean {
  if (pointerType === 'touch' || pointerType === 'pen') return heldMs >= LONG_PRESS_MS
  return travelPx >= DRAG_THRESHOLD_PX
}

/**
 * The distance a pointer has travelled from where it went down.
 *
 * Both axes, because a header drag is horizontal and a list drag vertical, and
 * the threshold above is about intent rather than direction: a press that
 * slides down the page is no more a sort than one that slides across.
 */
export function travel(dx: number, dy: number): number {
  return Math.hypot(dx, dy)
}

/**
 * Where the column would land, as an edge rather than as a column.
 *
 * A drop needs two pictures, and they are not the same picture: the ghost says
 * WHAT is being carried, and this says WHERE it will go. A highlight on the
 * column underneath cannot say the second — dropping "on" a column is
 * ambiguous about which side of it the carried column ends up — which is why
 * every application that does this well draws a line in the gap instead.
 *
 * `after` is read off the direction of travel: a column dragged right lands
 * after the column it is over, and one dragged left lands before it. That is
 * what makes the line appear on the side the reader is moving toward, and it
 * is also exactly what `moveColumn` does when it puts the column at the
 * target's index.
 *
 * Over its own column the answer is its own leading edge, so the line sits
 * still at the place the column came from rather than flicking to one side.
 */
export interface DropEdge {
  key: string
  after: boolean
}

export function dropEdge(
  spans: readonly ColumnSpan[],
  fromKey: string,
  pos: number,
): DropEdge | null {
  const over = keyAtPosition(spans, pos)
  if (over === null) return null
  if (over === fromKey) return { key: fromKey, after: false }
  const from = spans.findIndex((s) => s.key === fromKey)
  const to = spans.findIndex((s) => s.key === over)
  if (from === -1 || to === -1) return { key: over, after: false }
  return { key: over, after: to > from }
}

/** How far the ghost sits from the pointer, and the widest it is allowed to be. */
export const GHOST_GAP_PX = 12
export const GHOST_MAX_PX = 200

/**
 * Where the ghost goes, given where the pointer is.
 *
 * Beside the pointer rather than under it, so the pointer can still be seen
 * against the line it is choosing; on whichever side has room, because the
 * grips that start a drag sit at the right edge of the Columns picker, which
 * itself sits at the right edge of the window — put the ghost to the right
 * there and it is a label half off the screen.
 *
 * Takes the viewport width rather than reading `window`, for the reason
 * everything in this file does: Vitest has no window, and a placement that
 * cannot be tested is one that comes back wrong on the edge case it was
 * written for.
 */
export function ghostLeft(pointerX: number, viewportWidth: number): number {
  const right = pointerX + GHOST_GAP_PX
  if (right + GHOST_MAX_PX <= viewportWidth) return right
  return Math.max(4, pointerX - GHOST_GAP_PX - GHOST_MAX_PX)
}
