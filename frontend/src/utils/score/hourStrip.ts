/**
 * The hours a row's strip draws in its Score cell (record 0306): the lit hours
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
