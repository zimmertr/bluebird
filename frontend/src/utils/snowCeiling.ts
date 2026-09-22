// Where the snow depth column stops counting, and the mark a cell wears there.
//
// SNODAS carries depth as 16-bit integer millimetres, so 32,767 mm is the
// largest depth the file can hold and the header says so (`Maximum data
// value`). Through the `Meters / 1000` divisor that is 1,290.04 in. The model
// holds more than this over deep ice and the file clips it: NOAA's own map
// service reported 68.62 m at Mount Rainier's summit on 2026-09-16, where the
// tar read 32.77 m. Measured 2026-09-22, 86 cells of the grid sat on the
// ceiling, Rainier, Baker and Adams among them.
//
// So a row at the ceiling is not a measurement and must not print as one. It
// prints `≥1,290`, which is the honest reading: at least this much, and
// permanent ice rather than a season's snow. Everything else about the cell is
// unchanged — its colour band, its Windy link, and its place in the ranking,
// which still sorts on the number itself and ties the ceiling rows together.
//
// The number is MIRRORED with `snodas.SNOW_DEPTH_CEILING_IN` and pinned by
// `mirrored_constants.json`: the mark is only honest while both sides agree on
// where the file stops, and the API answers the plain number either way.
//
// Pure, and beside the table rather than in it, for the reason every
// derivation in this repository is: Vitest runs node-env, so logic left inside
// a component is untestable by construction.

import { FAMILY_KEYS } from '../metrics'

/**
 * The largest depth the source file can carry, in inches.
 *
 * Mirrors `SNOW_DEPTH_CEILING_IN` in `backend/app/services/snodas.py`, which
 * derives it from the int16 maximum rather than typing it.
 */
export const SNOW_DEPTH_CEILING_IN = 1290.04

/** The one column this module speaks for, read off the family's own key list. */
export function isSnowDepthKey(key: string): boolean {
  return (FAMILY_KEYS.snow as readonly string[]).includes(key)
}

/**
 * What a snow depth cell reads when the file ran out of room, or null when the
 * value is a depth the file could hold and the column should format it.
 *
 * `grouped` is false for the downloaded file, whose other numbers carry no
 * thousands separator; the screen and the popup group like every other cell.
 */
export function snowCellText(value: unknown, grouped = true): string | null {
  if (typeof value !== 'number' || value < SNOW_DEPTH_CEILING_IN) return null
  const whole = Math.round(SNOW_DEPTH_CEILING_IN)
  return `≥${grouped ? whole.toLocaleString(undefined, { maximumFractionDigits: 0 }) : whole}`
}
