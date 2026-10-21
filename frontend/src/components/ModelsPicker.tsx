import { visibilityRows, type VisibilityModel } from '../utils/modelVisibility'
import { usePopover } from '../hooks/usePopover'
import Menu from './Menu'
import BottomSheet from './BottomSheet'
import { CHOICE_INPUT, CHOICE_ROW, MENU } from '../styles'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Every model on the chart, ranking first, in the order the chart draws them. */
  models: readonly VisibilityModel[]
  hidden: ReadonlySet<string>
  onToggle: (id: string) => void
  /** The Models button, which the menu stands 4px under at its rows' width (record 0201). */
  triggerRef: React.RefObject<HTMLButtonElement | null>
  /** A phone (#696): the menu is a bottom sheet rather than a card under its button. */
  sheet?: boolean
}

/**
 * Which compared models the chart draws, from the results bar (#232).
 *
 * The same popover the Columns picker is, for the same reason: this is a set of
 * things on screen and which of them to look at, which is the question Columns
 * already answers one way. It now shares the recipe rather than a copy of it —
 * `usePopover` places and dismisses both, `Menu` is the card both sit in,
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
  sheet = false,
}: Props) {
  // Closed to the popover's hook on a phone, whose sheet places and dismisses
  // itself: a press inside the sheet would read as a press outside the card.
  const { popoverRef, box, closing } = usePopover({ open: open && !sheet, onOpenChange, triggerRef })

  const rows = visibilityRows(models, hidden).map((row) => (
    <label key={row.id} className={sheet ? CHOICE_ROW : `${CHOICE_ROW} ${MENU.row} ${MENU.hover}`}>
      <input
        type="checkbox"
        checked={row.visible}
        onChange={() => onToggle(row.id)}
        className={CHOICE_INPUT}
      />
      <span className="flex-1">{row.label}</span>
    </label>
  ))

  if (sheet) {
    return open ? (
      <BottomSheet heading="Models" onClose={() => onOpenChange(false)}>
        {rows}
      </BottomSheet>
    ) : null
  }

  if (!box) return null

  return (
    <Menu box={box} popoverRef={popoverRef} closing={closing}>
      <div className={MENU.list}>{rows}</div>
    </Menu>
  )
}
