/**
 * What the Polygon row's three buttons say and which of them can act (#478,
 * #687).
 *
 * Out of here rather than inline in `DestinationsSection.tsx` so the rule is a
 * test per case rather than a reading of nested JSX conditions: the row used
 * to offer nothing but a disabled Done on entering draw mode, so a phone,
 * which has no Escape key, had no way out until it placed a point.
 *
 * The row is always the mode button, Cancel and Clear, in that order (#687):
 * a third of the panel each, so it stands on the edges the fields above it
 * do, with a button that does nothing greyed rather than missing.
 *
 * - The mode button enters draw mode (`draw`, or `edit` over a ring), and
 *   inside it is `done`, which keeps the ring and waits for three points.
 * - Cancel leaves the mode and puts back the ring it started with, so it can
 *   act at every count inside the mode, zero included: it is the one exit
 *   with no floor. Outside the mode there is nothing to cancel.
 * - Clear empties the ring and changes nothing else, so inside the mode it
 *   starts over and outside it throws the ring away. It acts over any point.
 */
export interface DrawRow {
  mode: 'draw' | 'edit' | 'done'
  modeEnabled: boolean
  cancelEnabled: boolean
  clearEnabled: boolean
}

export function drawControls(drawing: boolean, pointCount: number): DrawRow {
  return {
    mode: drawing ? 'done' : pointCount > 0 ? 'edit' : 'draw',
    modeEnabled: !drawing || pointCount >= 3,
    cancelEnabled: drawing,
    clearEnabled: pointCount > 0,
  }
}
