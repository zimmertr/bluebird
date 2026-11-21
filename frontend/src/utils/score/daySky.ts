import { dayKey } from '../calendar/calendarDates'
import type { DestinationResult } from '../../types'

/**
 * The day strip's sky after a forecast (record 0323), the prototype's: each
 * day as eight blocks of three hours, each block the score that the best
 * tenth of the field reaches at the block's first hour, so a day reads as
 * how good the best places get through it rather than as one place's hours.
 * Pure, so the rule is pinned in node and the strip only draws it.
 */

/** Hours in one block of the sky. */
export const SKY_BLOCK_HOURS = 3
/** Blocks in a day. */
export const SKY_BLOCKS = 24 / SKY_BLOCK_HOURS
/** The share of the field whose score a block shows: the best tenth. */
export const SKY_TOP_SHARE = 0.1

/**
 * Each local day the field's hours reach, keyed `YYYY-MM-DD` as the strip's
 * days are, with its eight blocks, a block null where no row scored that hour.
 * Only rows on the field's own grid are read, since a row's hours line up
 * with `times` by index.
 */
export function daySky(
  rows: readonly DestinationResult[],
  times: readonly number[],
): Map<string, (number | null)[]> {
  const aligned = rows.filter((r) => r.score_hours && r.score_hours.length === times.length && !r.series_times)
  const out = new Map<string, (number | null)[]>()
  for (let i = 0; i < times.length; i++) {
    const at = new Date(times[i])
    if (at.getHours() % SKY_BLOCK_HOURS !== 0) continue
    const key = dayKey(at)
    const blocks = out.get(key) ?? Array.from({ length: SKY_BLOCKS }, () => null)
    const scores = aligned
      .map((r) => r.score_hours![i])
      .filter((s): s is number => s != null)
      .sort((a, b) => b - a)
    blocks[at.getHours() / SKY_BLOCK_HOURS] = scores.length > 0 ? scores[Math.floor(scores.length * SKY_TOP_SHARE)] : null
    out.set(key, blocks)
  }
  return out
}
