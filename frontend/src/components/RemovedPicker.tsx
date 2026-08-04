import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RemovedEntry } from '../utils/removals'
import { popoverBox, PopoverBox } from '../utils/listbox'
import { FOCUS_RING, LAYER, LINK_ACTION, TEXT, SURFACE_CARD } from '../styles'

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
// sequencing mirror ColumnsPicker — same portal, same placement math, same
// dismissal — since the two are siblings on the same bar.
export default function RemovedPicker({
  open,
  onOpenChange,
  entries,
  onRestore,
  onRestoreAll,
  triggerRef,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<PopoverBox | null>(null)
  // Whether this open has had its measuring pass yet — see ColumnsPicker,
  // whose trigger likewise lives in App and only flips `open`.
  const measuredRef = useRef(false)

  function place(desiredHeight = Infinity) {
    const trigger = triggerRef.current
    if (!trigger) return
    setBox(
      popoverBox(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        {
          preferredWidth: 256,
          gap: 4,
          margin: 8,
          desiredHeight,
        },
      ),
    )
  }

  // Position the popover before paint
  useLayoutEffect(() => {
    if (open) place()
  }, [open])

  // The once-per-open measuring pass, after every commit — ColumnsPicker
  // explains why an [open]-keyed pass measures nothing on the first open.
  useLayoutEffect(() => {
    if (!open) {
      measuredRef.current = false
      return
    }
    const popover = popoverRef.current
    if (popover && !measuredRef.current) {
      measuredRef.current = true
      place(popover.scrollHeight)
    }
  })

  // Restoring the last row empties the list out from under the popover: close
  // it and hand focus back to the trigger, so a keyboard user is not left
  // focused on an unmounted button.
  useEffect(() => {
    if (open && entries.length === 0) {
      onOpenChange(false)
      triggerRef.current?.focus()
    }
  }, [open, entries.length, onOpenChange, triggerRef])

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }

    // Pointerdown rather than click, matching ColumnsPicker: a click landing
    // on something that unmounts under it never reaches document.
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onOpenChange(false)
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, onOpenChange, triggerRef])

  if (!open || !box) return null

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        ...box.offset,
      }}
      className={`${SURFACE_CARD} ${LAYER.popover} flex flex-col`}
    >
      <div className={`${TEXT.overline} border-b border-slate-700 px-3 py-2`}>Removed rows</div>

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
    </div>,
    document.body,
  )
}
