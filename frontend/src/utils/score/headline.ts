/**
 * The results column's headline: how many destinations reached the bar.
 *
 * The bar is `HEADLINE_BAR` when anything reached it, so "12 places score 80
 * or better" means the same on any day. On a day nothing does, the bar drops
 * to the highest multiple of ten anything reached, so the headline still names
 * the best of a bad field rather than a count of zero.
 */
import { grouped } from '../numbers'
import { HOUR_MS } from '../forecastWindow'

export const HEADLINE_BAR = 80

export interface Headline {
  bar: number
  count: number
  /** How many scored rows the count is out of. */
  total: number
}

export function headline(scores: readonly (number | null)[]): Headline | null {
  const known = scores.filter((s): s is number => s != null)
  if (known.length === 0) return null
  const max = Math.max(...known)
  const bar = max >= HEADLINE_BAR ? HEADLINE_BAR : Math.floor(max / 10) * 10
  return { bar, count: known.filter((s) => s >= bar).length, total: known.length }
}

/**
 * The span the score's colour is stretched over: the field's own range, from
 * its 5th percentile to its best, so a field that all scored between 40 and 87
 * still tells 83 from 87. The bottom twentieth is clipped so one ruined row
 * cannot flatten the rest. Null for a field with no spread to stretch.
 */
export function scoreRange(scores: readonly (number | null)[]): { lo: number; hi: number } | null {
  const sorted = scores.filter((s): s is number => s != null).sort((a, b) => a - b)
  if (sorted.length < 2) return null
  const lo = sorted[Math.floor(sorted.length * 0.05)] ?? sorted[0] ?? 0
  const hi = sorted[sorted.length - 1] ?? lo
  return hi > lo ? { lo, hi } : null
}

/**
 * The headline as the results header says it, the prototype's (record 0319):
 * `37 of 230 score 80 or more`, the verb singular for one. In the PR's table
 * for approval.
 */
export function headlineText(h: Headline): string {
  return `${grouped(h.count)} of ${grouped(h.total)} ${h.count === 1 ? 'scores' : 'score'} ${h.bar} or more`
}

/** How many of the top rows the best hours are read over. */
export const BEST_HOURS_ROWS = 20

/** An hour as the prototype writes it on a strip: `1p`, `11a`, `12p`. */
export function hourShort(ms: number): string {
  const h = new Date(ms).getHours()
  return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`
}

/**
 * When the best hours mostly fall (record 0319), from the top rows' best
 * stretches: the day most of them fall on, and that day's middle start, as
 * `Best hours mostly Sat, 1p–5p`. Null with no stretch to read.
 */
export function bestHoursText(starts: readonly number[], runHours: number): string | null {
  if (starts.length === 0) return null
  const byDay = new Map<string, number[]>()
  for (const ms of starts) {
    const day = new Date(ms).toLocaleDateString(undefined, { weekday: 'short' })
    byDay.set(day, [...(byDay.get(day) ?? []), ms])
  }
  const [day, ms] = [...byDay].sort((a, b) => b[1].length - a[1].length)[0]
  const sorted = [...ms].sort((a, b) => a - b)
  const mid = sorted[Math.floor(sorted.length / 2)]
  return `Best hours mostly ${day}, ${hourShort(mid)}–${hourShort(mid + runHours * HOUR_MS)}`
}

/**
 * When a row's best four hours fall, as `Sat 1p–5p`, for the compact table's
 * line under the name (record 0320); null with no stretch.
 */
export function bestWhen(startMs: number | null | undefined, endMs: number | null | undefined): string | null {
  if (startMs == null || endMs == null) return null
  const day = new Date(startMs).toLocaleDateString(undefined, { weekday: 'short' })
  return `${day} ${hourShort(startMs)}–${hourShort(endMs)}`
}
