import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SortBy } from '../types'
import { ColDef } from '../utils/tableColumns'
import { METRIC_CONFIG } from '../utils/colors'
import { popoverBox, PopoverBox } from '../utils/listbox'
import {
  CHOICE_INPUT,
  CHOICE_ROW,
  LAYER,
  TEXT,
  SURFACE_CARD,
} from '../styles'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ColDef[]
  sortBy: SortBy
  visibleKeys: Set<string>
  onVisibilityChange: (keys: Set<string>) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function ColumnsPicker({
  open,
  onOpenChange,
  columns,
  sortBy,
  visibleKeys,
  onVisibilityChange,
  triggerRef,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<PopoverBox | null>(null)

  const rankedGroup = new Set(METRIC_CONFIG[sortBy].group)

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

  // Measure the popover height and re-place
  useLayoutEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    if (popover) place(popover.scrollHeight)
  }, [open])

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
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
      <div className={`${TEXT.overline} border-b border-slate-700 px-3 py-2`}>Display Columns</div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1 space-y-1">
        {columns.map((col) => {
          const isRanked = rankedGroup.has(col.key)
          const isVisible = visibleKeys.has(col.key)

          return (
            <label key={col.key} className={CHOICE_ROW}>
              <input
                type="checkbox"
                checked={isVisible}
                disabled={isRanked}
                onChange={(e) => {
                  const next = new Set(visibleKeys)
                  if (e.target.checked) {
                    next.add(col.key)
                  } else {
                    next.delete(col.key)
                  }
                  onVisibilityChange(next)
                }}
                className={CHOICE_INPUT}
                aria-label={`${col.label} column`}
              />
              <span className="flex-1">{col.label}</span>
            </label>
          )
        })}
      </div>

      <div className={`${TEXT.caption} border-t border-slate-700 px-3 py-2 italic`}>
        The CSV always includes every column.
      </div>
    </div>,
    document.body,
  )
}
