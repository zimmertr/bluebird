/**
 * The results column's headline: how many destinations reached the bar.
 *
 * The bar is `HEADLINE_BAR` when anything reached it, so "12 places score 80
 * or better" means the same on any day. On a day nothing does, the bar drops
 * to the highest multiple of ten anything reached, so the headline still names
 * the best of a bad field rather than a count of zero.
 */

export const HEADLINE_BAR = 80

export interface Headline {
  bar: number
  count: number
}

export function headline(scores: readonly (number | null)[]): Headline | null {
  const known = scores.filter((s): s is number => s != null)
  if (known.length === 0) return null
  const max = Math.max(...known)
  const bar = max >= HEADLINE_BAR ? HEADLINE_BAR : Math.floor(max / 10) * 10
  return { bar, count: known.filter((s) => s >= bar).length }
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
