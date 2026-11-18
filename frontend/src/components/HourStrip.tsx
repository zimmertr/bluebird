import type { DestinationResult } from '../types'
import { HOUR_STRIP } from '../styles'
import { scoreColor } from '../utils/colors'
import { stripHours } from '../utils/score/hourStrip'

/**
 * A row's lit hours beside its score (record 0306): each hour in the score's
 * ramp, a gap where a night falls, and the best stretch drawn taller. The
 * number beside it is what a reader hears, so the strip is hidden from a
 * screen reader rather than spelling out every hour.
 */
export default function HourStrip({ row }: { row: DestinationResult }) {
  const hours = stripHours(row.score_hours, row.score_lit, row.score_best)
  if (hours.length === 0) return null
  return (
    <span aria-hidden="true" className={HOUR_STRIP.strip}>
      {hours.map((h, i) => (
        <span
          key={i}
          className={`${HOUR_STRIP.hour} ${h.best ? HOUR_STRIP.best : ''} ${h.gap ? HOUR_STRIP.gap : ''}`}
          style={h.score === null ? undefined : { backgroundColor: scoreColor(h.score, null) }}
        />
      ))}
    </span>
  )
}
