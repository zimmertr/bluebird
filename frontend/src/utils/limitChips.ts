/**
 * The forecast bounds as the results header names them (record 0319): one
 * chip per bound set, in plain words, so a reader sees what is hiding rows
 * without opening the Limits card. The prototype's idea 11.
 *
 * Every word here is in the PR's strings table for the maintainer's approval.
 */
import { NOUN, UNIT, type MetricFamily } from '../metrics'
import { FAMILY_BOUNDS, type Constraints } from './constraints'
import { grouped } from './numbers'

export interface LimitChip {
  /** The bound the chip's × clears. */
  key: keyof Constraints
  text: string
}

/** A bound's value with its unit: a space before a word, none before a degree. */
export function withUnit(value: number, family: MetricFamily): string {
  const unit = UNIT[family]
  const n = Number.isInteger(value) ? grouped(value) : String(value)
  if (unit === '') return n
  return unit.startsWith('°') ? `${n}${unit}` : `${n} ${unit}`
}

/** One chip per bound set, family by family in the Metrics table's order. */
export function limitChips(c: Constraints): LimitChip[] {
  const chips: LimitChip[] = []
  for (const [family, [lower, upper]] of Object.entries(FAMILY_BOUNDS) as [MetricFamily, [keyof Constraints, keyof Constraints]][]) {
    const lo = c[lower]
    const hi = c[upper]
    if (lo !== null) chips.push({ key: lower, text: `${NOUN[family]} above ${withUnit(lo, family)}` })
    if (hi !== null) {
      // A ceiling of nothing on what falls is the prototype's own phrase.
      const text = family === 'precip' && hi === 0 ? 'Nothing falling' : `${NOUN[family]} under ${withUnit(hi, family)}`
      chips.push({ key: upper, text })
    }
  }
  return chips
}

/** The rows the bounds hide, as the header counts them: `12 hidden by limits`. */
export function hiddenText(n: number): string | null {
  return n > 0 ? `${grouped(n)} hidden by limits` : null
}
