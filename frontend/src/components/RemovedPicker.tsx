import { useEffect } from 'react'
import { RemovedEntry } from '../utils/removals'
import { collidingType, lineNamed, sharedNames } from '../utils/chartData'
import { usePopover } from '../hooks/usePopover'
import Menu from './Menu'
import BottomSheet from './BottomSheet'
import { CONTROL_SIZE, FOCUS_RING, LINK_ACTION, MENU, TEXT } from '../styles'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Removal order, as App's Map iterates it. */
  entries: [string, RemovedEntry][]
  onRestore: (key: string) => void
  onRestoreAll: () => void
  /** The Removed button, which the menu stands 4px under at its rows' width (record 0200). */
  triggerRef: React.RefObject<HTMLButtonElement | null>
  /** A phone (#696): the menu is a bottom sheet rather than a card under its button. */
  sheet?: boolean
}

// The list behind the results bar's "Removed (N)" button (#241): every ×-ed
// row by name, each with its own restore, so a removal is reversible for as
// long as it is in force rather than for the lifetime of a toast. Chrome and
// sequencing are ColumnsPicker's, from the one shell and the one hook both ask
// (#385), since the two are siblings on the same bar.
export default function RemovedPicker({
  open,
  onOpenChange,
  entries,
  onRestore,
  onRestoreAll,
  triggerRef,
  sheet = false,
}: Props) {
  // Closed to the popover's hook on a phone, whose sheet places and dismisses
  // itself: a press inside the sheet would read as a press outside the card.
  const { popoverRef, box, closing } = usePopover({ open: open && !sheet, onOpenChange, triggerRef })

  // Restoring the last row empties the list out from under the popover, so it
  // closes. Where the keyboard goes is the sheet's: the trigger hides at zero
  // with the list, so there is no trigger to hand it back to (#576).
  useEffect(() => {
    if (open && entries.length === 0) onOpenChange(false)
  }, [open, entries.length, onOpenChange])

  // Two removed places of one name (a crag and the peak it is named for,
  // #715) each name their type, as the chart's lines do; a name no other
  // entry shares reads bare.
  const shared = sharedNames(entries.map(([, entry]) => entry.row))
  const rows = entries.map(([key, entry]) => {
    const name = lineNamed(entry.row.name, collidingType(entry.row, shared))
    return (
      <div key={key} className={`flex items-center gap-2 ${sheet ? 'px-2 py-1' : MENU.row}`}>
        <span className={`${TEXT.control} min-w-0 flex-1 truncate`}>{name}</span>
        {/* At the control size, the floor for anything pressed (#687):
            it was the micro step. Colourless, so the link colour is
            LINK_ACTION's alone rather than racing TEXT.control's slate. */}
        <button
          onClick={() => onRestore(key)}
          aria-label={`Restore ${name}`}
          className={`${CONTROL_SIZE} ${LINK_ACTION} ${FOCUS_RING} cursor-pointer whitespace-nowrap`}
        >
          Restore
        </button>
      </div>
    )
  })
  const restoreAll = entries.length > 1 && (
    <button
      onClick={onRestoreAll}
      className={`${CONTROL_SIZE} ${LINK_ACTION} ${FOCUS_RING} cursor-pointer`}
    >
      Restore all
    </button>
  )

  // On a phone the sheet's heading is the words the desk card's overline
  // says, and Restore all is its last row.
  if (sheet) {
    return open ? (
      <BottomSheet heading="Removed rows" onClose={() => onOpenChange(false)}>
        {rows}
        {restoreAll && <div className="flex items-center px-2">{restoreAll}</div>}
      </BottomSheet>
    ) : null
  }

  if (!box) return null

  return (
    <Menu box={box} popoverRef={popoverRef} closing={closing} header="Removed rows">
      <div className={MENU.list}>{rows}</div>

      {restoreAll && <div className={MENU.foot}>{restoreAll}</div>}
    </Menu>
  )
}
