// The two edges of what the cloud deck can measure, and the mark a value wears
// there (TJ, 2026-10-08).
//
// The deck walks the column from 1000 hPa to 300 hPa (#670), so two readings
// are not heights. An hour whose column never reached saturation reads the
// standard height of 300 hPa, `CLOUD_DECK_CEILING_FT`: no deck below it, not a
// deck at it. An hour whose bottom level is saturated reads the standard height
// of 1000 hPa: the deck is there or lower, and under a mountain that level is
// below the ground and its humidity is the model's extrapolation. Printing
// either as a plain number states a measurement the walk never made, so each
// prints as a bound.
//
// Only the printed text changes. The ranking, the bounds, the colour band and
// the Windy link read the number, and the API answers it, which is the snow
// depth ceiling's rule (record 0053) carried over.

import { CLOUD_DECK_CEILING_FT, FT_TO_M, ISA_HEIGHT_M, roundHalfEven } from './openMeteoAggregate'

/**
 * The bottom of the walk in whole feet: the standard height of 1000 hPa, 364.
 * Derived from the mirrored level table rather than typed, so it moves if the
 * table does.
 */
export const CLOUD_DECK_FLOOR_FT = roundHalfEven(ISA_HEIGHT_M[1000] / FT_TO_M, 0)

/**
 * What the ceiling prints as. Rounded down from 30,066 because the reader's
 * question is "is there cloud below me", and almost no deck the walk can
 * interpolate lands in the 66 feet between the two (TJ, 2026-10-08). The floor
 * is not rounded the same way: a real deck can be interpolated just above 364,
 * and it would print as a plain number under a mark that claimed more room.
 */
export const CLOUD_DECK_CEILING_SHOWN_FT = 30_000

/**
 * The mark a cloud deck value prints as, or null when it is a height the walk
 * found and the column should format it.
 *
 * `grouped` is false where the numbers beside it carry no thousands separator:
 * the downloaded file and the chart's tooltip.
 */
export function cloudDeckMark(value: unknown, grouped = true): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const whole = Math.round(value)
  if (whole >= CLOUD_DECK_CEILING_FT) {
    const shown = grouped ? CLOUD_DECK_CEILING_SHOWN_FT.toLocaleString() : String(CLOUD_DECK_CEILING_SHOWN_FT)
    return `≥${shown}`
  }
  if (whole === CLOUD_DECK_FLOOR_FT) return `≤${CLOUD_DECK_FLOOR_FT}`
  return null
}

/** Whether printed text is one of the marks above rather than a height. */
export function isCloudDeckMark(text: string): boolean {
  return text.startsWith('≥') || text.startsWith('≤')
}
