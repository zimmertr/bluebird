import { visibilityRows, type VisibilityModel } from '../utils/modelVisibility'
import { usePopover } from '../hooks/usePopover'
import Popover from './Popover'
import { CHOICE_INPUT, CHOICE_ROW } from '../styles'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every model on the chart, ranking first, in the order the chart draws them. */
  models: readonly VisibilityModel[]
  hidden: ReadonlySet<string>
  onToggle: (id: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * Which compared models the chart draws, from the results bar (#232).
 *
 * The same popover the Columns picker is, for the same reason: this is a set of
 * things on screen and which of them to look at, which is the question Columns
 * already answers one way. It now shares the recipe rather than a copy of it —
 * `usePopover` places and dismisses both, `Popover` is the card both sit in,
 * and both wear `CHOICE_ROW`/`CHOICE_INPUT` rows — so the two read as one
 * control and cannot drift apart again (#385).
 *
 * It hides lines and nothing else. Every forecast behind it is already bought,
 * so a box here spends nothing either way, and nothing it does reaches the
 * link, the ranking, the table or the file.
 *
 * A row is a checkbox and a name, with no colour on it. A compared model is
 * not one colour on the chart — every (destination, model) pair has its own —
 * so a square here could only name one line out of however many that model
 * draws. The hover box is where a line is identified, by its colour dot and
 * its full `1. Mount Rainier (ECMWF IFS)` name together.
 *
 * All the decisions are `utils/modelVisibility.ts`'s, because Vitest has no DOM.
 */
export default function ModelsPicker({
  open,
  onOpenChange,
  models,
  hidden,
  onToggle,
  triggerRef,
}: Props) {
  const { popoverRef, box } = usePopover({ open, onOpenChange, triggerRef })

  if (!open || !box) return null

  return (
    <Popover box={box} popoverRef={popoverRef}>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1">
        {visibilityRows(models, hidden).map((row) => (
          <label key={row.id} className={CHOICE_ROW}>
            <input
              type="checkbox"
              checked={row.visible}
              onChange={() => onToggle(row.id)}
              className={CHOICE_INPUT}
            />
            <span className="flex-1">{row.label}</span>
          </label>
        ))}
      </div>
    </Popover>
  )
}
