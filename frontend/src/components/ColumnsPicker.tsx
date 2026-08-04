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
  // Whether this open has had its measuring pass yet — see below.
  const measuredRef = useRef(false)

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

  // The measuring pass, run after EVERY commit rather than keyed on `open`.
  // On the first-ever open the popover cannot render until the initial
  // place() above has set a box, so an [open]-keyed pass ran before the
  // element existed, measured nothing, and the unmeasured fallback (pinned to
  // the top of the viewport) stuck for the whole open — while every later
  // open rendered early against the previous open's stale box and got
  // measured, which is exactly the "wrong once, right afterwards" bug.
  // ModelPicker avoids this by placing before it opens; this picker's trigger
  // lives in App and only flips `open`, so the once-per-open ref does the
  // sequencing instead. The ref is what stops the loop: place() sets state,
  // which lands back here.
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

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }

    // Pointerdown rather than click, matching ModelPicker: a click that lands
    // on something which unmounts under it never reaches document, and the
    // picker would stay open. The trigger is exempt so its own toggle does not
    // fire close-then-reopen — and on a phone, where the popover lands on top
    // of the trigger, that press hits the popover and keeps it open, which is
    // why anywhere-outside has to dismiss.
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
      <div className={`${TEXT.overline} border-b border-slate-700 px-3 py-2`}>Display columns</div>

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

    </div>,
    document.body,
  )
}
