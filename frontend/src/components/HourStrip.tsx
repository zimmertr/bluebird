import type { DestinationResult } from '../types'
import { HOUR_STRIP } from '../styles'
import { scoreColor } from '../utils/colors'
import { stripDays, stripHours, type StripHour } from '../utils/score/hourStrip'

type Range = { lo: number; hi: number } | null

/**
 * A row's lit hours (record 0307): each hour in the score's ramp. The number
 * beside it is what a reader hears, so the strip is hidden from a screen
 * reader rather than spelling out every hour.
 *
 * Beside the score, as the full table draws it, a gap stands where a night
 * falls and the best stretch is drawn taller. Given the field's `times`, it
 * is the compact table's own column (record 0320): one block per day under
 * the header's day names, and the best stretch bracketed beneath.
 */
export default function HourStrip({
  row,
  range = null,
  times,
}: {
  row: DestinationResult
  /** The range the score's colour is stretched over, the Score cell's own. */
  range?: Range
  /** The field's grid, for the compact table's day blocks. */
  times?: readonly number[]
}) {
  if (times) return <DayStrip row={row} range={range} times={times} />
  const hours = stripHours(row.score_hours, row.score_lit, row.score_best)
  if (hours.length === 0) return null
  return (
    <span aria-hidden="true" className={HOUR_STRIP.strip}>
      {hours.map((h, i) => (
        <span
          key={i}
          className={`${HOUR_STRIP.hour} ${h.best ? HOUR_STRIP.best : ''} ${h.gap ? HOUR_STRIP.gap : ''}`}
          style={fill(h, range)}
        />
      ))}
    </span>
  )
}

const fill = (h: StripHour, range: Range) => (h.score === null ? undefined : { backgroundColor: scoreColor(h.score, range) })

function DayStrip({ row, range, times }: { row: DestinationResult; range: Range; times: readonly number[] }) {
  const days = stripDays(row.score_hours, row.score_lit, row.score_best, row.series_times ?? times)
  if (days.length === 0) return null
  return (
    <span aria-hidden="true" className={HOUR_STRIP.days}>
      {days.map((day, d) => (
        <span key={d} className={HOUR_STRIP.day}>
          {runs(day.hours).map((run, r) =>
            run.best ? (
              // The bracket's run takes its hours' share of the day, so each
              // hour in it is as wide as one outside it.
              <span key={r} className={HOUR_STRIP.run} style={{ flexGrow: run.hours.length }}>
                {run.hours.map((h, i) => (
                  <span key={i} className={HOUR_STRIP.cell} style={fill(h, range)} />
                ))}
                <span className={HOUR_STRIP.bracket} />
              </span>
            ) : (
              run.hours.map((h, i) => <span key={`${r}-${i}`} className={HOUR_STRIP.cell} style={fill(h, range)} />)
            ),
          )}
        </span>
      ))}
    </span>
  )
}

/** A day's hours as runs in and out of the best stretch. */
function runs(hours: readonly StripHour[]): { best: boolean; hours: StripHour[] }[] {
  const out: { best: boolean; hours: StripHour[] }[] = []
  for (const h of hours) {
    const last = out[out.length - 1]
    if (last && last.best === h.best) last.hours.push(h)
    else out.push({ best: h.best, hours: [h] })
  }
  return out
}
