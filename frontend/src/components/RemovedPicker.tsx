import { useEffect } from 'react'
import { RemovedEntry } from '../utils/removals'
import { usePopover } from '../hooks/usePopover'
import Popover from './Popover'
import { FOCUS_RING, LINK_ACTION, TEXT } from '../styles'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Removal order, as App's Map iterates it. */
  entries: [string, RemovedEntry][]
  onRestore: (key: string) => void
  onRestoreAll: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
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
}: Props) {
  const { popoverRef, box } = usePopover({ open, onOpenChange, triggerRef })

  // Restoring the last row empties the list out from under the popover: close
  // it and hand focus back to the trigger, so a keyboard user is not left
  // focused on an unmounted button.
  useEffect(() => {
    if (open && entries.length === 0) {
      onOpenChange(false)
      triggerRef.current?.focus()
    }
  }, [open, entries.length, onOpenChange, triggerRef])

  if (!open || !box) return null

  return (
    <Popover box={box} popoverRef={popoverRef} header="Removed rows">
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {entries.map(([key, entry]) => (
          <div key={key} className="flex items-center gap-2 px-2 py-1">
            <span className={`${TEXT.control} min-w-0 flex-1 truncate`}>{entry.row.name}</span>
            <button
              onClick={() => onRestore(key)}
              aria-label={`Restore ${entry.row.name}`}
              className={`${TEXT.micro} ${LINK_ACTION} ${FOCUS_RING} cursor-pointer whitespace-nowrap`}
            >
              Restore
            </button>
          </div>
        ))}
      </div>

      {entries.length > 1 && (
        <div className="border-t border-slate-700 px-3 py-2">
          <button
            onClick={onRestoreAll}
            className={`${TEXT.micro} ${LINK_ACTION} ${FOCUS_RING} cursor-pointer`}
          >
            Restore all
          </button>
        </div>
      )}
    </Popover>
  )
}
