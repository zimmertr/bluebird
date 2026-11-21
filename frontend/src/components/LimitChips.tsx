import type { Constraints } from '../utils/constraints'
import { hiddenText, limitChips } from '../utils/limitChips'
import { IconClose, IconPlus } from './icons'
import { RESULTS_HEAD } from '../styles'

interface Props {
  constraints: Constraints
  /** Clears one bound: the chip's ×. */
  onRemove: (key: keyof Constraints) => void
  /** Opens the Limits card, where a bound is set. */
  onAdd: () => void
  /** How many rows the bounds hide. */
  hidden: number
}

/**
 * The forecast bounds in plain words under the lenses (record 0319): one chip
 * per bound with its ×, the pill that opens the Limits card, and how many
 * rows the bounds hide. The prototype's idea 11, so a reader sees what is
 * narrowing the field without opening a card.
 */
export default function LimitChips({ constraints, onRemove, onAdd, hidden }: Props) {
  const chips = limitChips(constraints)
  const hiddenLine = hiddenText(hidden)
  return (
    <div role="group" aria-label="Limits" className={RESULTS_HEAD.limits}>
      {chips.map((chip) => (
        <span key={chip.key} className={RESULTS_HEAD.limit}>
          {chip.text}
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={`Remove ${chip.text}`}
            className={RESULTS_HEAD.limitRemove}
          >
            <IconClose size="chip" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onAdd} className={RESULTS_HEAD.add}>
        <IconPlus size="chip" />
        Limit
      </button>
      {hiddenLine !== null && <span className={RESULTS_HEAD.hidden}>{hiddenLine}</span>}
    </div>
  )
}
