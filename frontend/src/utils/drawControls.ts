/**
 * Which buttons the Polygon row shows, and in what order (#478).
 *
 * Out of here rather than inline in `DestinationsSection.tsx` so the rule is a
 * test per case rather than a reading of nested JSX conditions: the row used
 * to offer nothing but a disabled Done on entering draw mode, so a phone,
 * which has no Escape key, had no way out until it placed a point.
 *
 * - `start` enters draw mode (Draw polygon, or Edit polygon over a ring).
 * - `done` leaves it keeping the ring, and waits for three points.
 * - `cancel` leaves it and puts back the ring the mode started with, so it
 *   shows at every count, zero included: it is the one exit with no floor.
 * - `clear` empties the ring and changes nothing else, so inside the mode it
 *   starts over and outside it throws the ring away. It shows only when there
 *   is a point to throw away.
 */
export type DrawControl = 'start' | 'done' | 'cancel' | 'clear'

export function drawControls(drawing: boolean, pointCount: number): DrawControl[] {
  const controls: DrawControl[] = drawing ? ['done', 'cancel'] : ['start']
  if (pointCount > 0) controls.push('clear')
  return controls
}
