import { forecastDayLabel } from '../timeline'

/**
 * The hours a row's strip draws in its Score cell (record 0307): the lit hours
 * the score read, in order, each with its score, a gap before an hour that
 * follows a night, and the best stretch marked. Pure, so the strip's one rule,
 * which hours stand and where the gaps fall, is pinned in node.
 */
export interface StripHour {
  /** The hour's score, or null where no factor answered. */
  score: number | null
  /** A night, or any hour left out, stands before this one. */
  gap: boolean
  /** One of the best stretch's hours. */
  best: boolean
}

export function stripHours(
  hours: readonly (number | null)[] | null | undefined,
  lit: readonly boolean[] | null | undefined,
  best: readonly [number, number] | null | undefined,
): StripHour[] {
  if (!hours || !lit) return []
  const out: StripHour[] = []
  let last = -1
  for (let i = 0; i < hours.length; i++) {
    if (!lit[i]) continue
    out.push({
      score: hours[i] ?? null,
      gap: last !== -1 && i !== last + 1,
      best: best != null && i >= best[0] && i < best[1],
    })
    last = i
  }
  return out
}

/** One local day of a row's lit hours, as the compact table draws it. */
export interface StripDay {
  /** The day's short name, as `Sat`. */
  label: string
  hours: StripHour[]
}

/**
 * The lit hours grouped by the reader's local day (record 0320), for the
 * compact table's strip, which draws each day as one block under its name in
 * the header. `times` is the field's grid, which a row's own series times
 * override, the grid the score read (`scoreRow`).
 */
export function stripDays(
  hours: readonly (number | null)[] | null | undefined,
  lit: readonly boolean[] | null | undefined,
  best: readonly [number, number] | null | undefined,
  grid: readonly number[],
): StripDay[] {
  if (!hours || !lit) return []
  const out: StripDay[] = []
  let day: string | null = null
  for (let i = 0; i < hours.length; i++) {
    if (!lit[i] || grid[i] === undefined) continue
    const key = new Date(grid[i]).toDateString()
    if (key !== day) {
      out.push({ label: forecastDayLabel(grid[i]), hours: [] })
      day = key
    }
    out[out.length - 1].hours.push({
      score: hours[i] ?? null,
      gap: false,
      best: best != null && i >= best[0] && i < best[1],
    })
  }
  return out
}
