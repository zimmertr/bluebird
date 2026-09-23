// The forecast grid's legend row: the pitch the field was drawn at, or the
// state that stands in for it while the samples are still arriving.

import { SEP } from '../metrics'

/**
 * The pitch as a distance, formatted the way the model picker formats the same
 * kind of number (`gridLabel` in useCapabilities): a space before the unit, so
 * the figure in the legend and the figure beside a model's name are visibly the
 * same quantity rather than two conventions.
 *
 * Whole km past 10, one decimal below it: the finest model here is GEM at
 * 2.5 km, and rounding that to "3 km" would misstate a number the reader can
 * check against the picker.
 */
export function pitchLabel(pitchKm: number): string {
  const km = pitchKm < 10 ? Math.round(pitchKm * 10) / 10 : Math.round(pitchKm)
  return `${km} km`
}

/**
 * The forecast grid's legend row: a label and the value that right-justifies
 * beside it, which is the shape every layer row takes — name on the left, key
 * on the right.
 *
 * The label is the LAYER's name in every state, never the value's. It reads
 * `Grid size` in one state and `Forecast grid` in another once, and one row
 * looking like two is the thing that fixed.
 *
 * Every state has a value, including the ones that are really a status. They
 * used to span the whole row on the reasoning that a status is not a key, which
 * was true and did not matter: what a reader sees is a column of rows, and one
 * of them breaking the column reads as a fault rather than as a distinction.
 *
 * The grid fills in progressively, so the only gap needing a cue is before the
 * first samples land — which after a large analysis is minutes, because the
 * grid shares its weighted budget with the analysis that just ran and inherits
 * that analysis's quota debt. Silence there reads as broken, and so does a
 * layer that was switched on and drew nothing, which is what `Unavailable` is
 * for.
 *
 * `Waiting` outranks `Loading` because it is the more specific answer to the
 * same question: not merely that nothing has arrived, but that nothing is being
 * asked for yet. And a PARTIAL field stalled behind the pacer says `Waiting`
 * too, not its pitch: a half-painted field labelled `4.8 km` claims a picture
 * it does not fully have, and the reader watches a frozen semicircle with a
 * legend asserting all is well (#288 review). Once the fetch completes, the
 * pitch is the answer even through a later pace — a whole field is a whole
 * field.
 *
 * `Waiting` carries its countdown — `Waiting · 42s` — so the word explains
 * itself and visibly is not frozen (TJ, 2026-08-21). And the caller colors
 * the value by `kind`: the transient states wear the app's warning amber so
 * a stall catches the eye, `Unavailable` wears the error red because it is
 * the one state that already failed, and the settled pitch wears the accent
 * — which is why kind rides the return rather than the caller re-deriving it
 * from strings.
 *
 * The grid's wind field is the 10 m wind while the markers carry wind at each
 * destination's elevation (issue #257). That difference is documented in
 * DATA.md rather than stated here: a second legend line was tried and
 * rejected, because vertical space on the map is the scarcest thing the app
 * has (TJ, 2026-08-21).
 */
export function gridLegendLine(
  painted: boolean,
  pitchKm: number,
  paceRemainingS: number | null,
  failed = false,
  complete = true,
): { label: string; value: string; kind: 'pitch' | 'status' | 'error' } {
  const label = 'Forecast grid'
  const pacing = paceRemainingS !== null && paceRemainingS > 0
  // Minutes past 99 seconds: three-digit seconds are both harder to read and
  // the one spelling that outgrows the legend box's measured width.
  const wait =
    paceRemainingS !== null && paceRemainingS > 99
      ? `${Math.round(paceRemainingS / 60)}m`
      : `${paceRemainingS}s`
  const waiting = { label, value: `Waiting ${SEP} ${wait}`, kind: 'status' as const }
  if (painted && !complete && pacing) return waiting
  if (painted) return { label, value: pitchLabel(pitchKm), kind: 'pitch' }
  if (failed) return { label, value: 'Unavailable', kind: 'error' }
  if (pacing) return waiting
  return { label, value: 'Loading', kind: 'status' }
}
