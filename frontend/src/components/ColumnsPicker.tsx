import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SortBy } from '../types'
import { ColDef } from '../utils/tableColumns'
import { FAMILY_KEYS, familyOf } from '../metrics'
import { popoverBox, PopoverBox } from '../utils/listbox'
import {
  CHOICE_INPUT,
  CHOICE_ROW,
  DRAG_GRIP,
  DRAG_GRIP_ACTIVE,
  DRAG_TARGET,
  LAYER,
  TEXT,
  SURFACE_CARD,
} from '../styles'
import { dragBegins, keyAtPosition, travel, type ColumnSpan } from '../utils/columnDrag'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  columns: ColDef[]
  sortBy: SortBy
  visibleKeys: Set<string>
  onVisibilityChange: (keys: Set<string>) => void
  // Move one column to where another sits. The picker names the two columns
  // and nothing else: the key list is App's, and `moveColumn` owns the move.
  onColumnMove?: (fromKey: string, toKey: string) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function ColumnsPicker({
  open,
  onOpenChange,
  columns,
  sortBy,
  visibleKeys,
  onVisibilityChange,
  onColumnMove,
  triggerRef,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<PopoverBox | null>(null)
  // Whether this open has had its measuring pass yet — see below.
  const measuredRef = useRef(false)

  const rankedGroup = new Set<string>(FAMILY_KEYS[familyOf(sortBy)])

  // The row elements, so a drag can ask which one the pointer is over. A ref
  // rather than state: it is read during a pointer move and never rendered.
  const rowsRef = useRef(new Map<string, HTMLElement>())
  // The column being dragged, and the one it would land on. Both are rendered,
  // so both are state.
  const [dragging, setDragging] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)

  // A press on a grip. It is not a drag until it has travelled far enough (a
  // mouse) or been held long enough (a finger) — `columnDrag.ts` owns which
  // question each pointer is asked, and the answer is what keeps a tap on the
  // grip from stealing the row's own click.
  function beginDrag(e: React.PointerEvent, key: string) {
    if (!onColumnMove) return
    e.preventDefault()
    const grip = e.currentTarget as HTMLElement
    grip.setPointerCapture(e.pointerId)
    const startedAt = performance.now()
    const startX = e.clientX
    const startY = e.clientY
    let live = false

    const spans = (): ColumnSpan[] =>
      [...rowsRef.current.entries()].map(([rowKey, el]) => {
        const rect = el.getBoundingClientRect()
        return { key: rowKey, start: rect.top, end: rect.bottom }
      })

    const move = (ev: PointerEvent) => {
      if (!live) {
        const far = travel(ev.clientX - startX, ev.clientY - startY)
        if (!dragBegins(ev.pointerType, far, performance.now() - startedAt)) return
        live = true
        setDragging(key)
      }
      const over = keyAtPosition(spans(), ev.clientY)
      setTarget(over)
      if (over && over !== key) onColumnMove(key, over)
    }

    const end = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', end)
      grip.removeEventListener('pointercancel', end)
      setDragging(null)
      setTarget(null)
    }

    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

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

          const isTarget = target === col.key && dragging !== col.key

          return (
            <label
              key={col.key}
              ref={(el) => {
                if (el) rowsRef.current.set(col.key, el)
                else rowsRef.current.delete(col.key)
              }}
              className={`${CHOICE_ROW} px-1 ${isTarget ? DRAG_TARGET : ''}`}
            >
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
              {/* The grip: a drag moves the column, and the arrow keys move it
                  one place at a time, which is the whole keyboard path for
                  reordering on either surface. It is a button so it can be
                  reached at all. */}
              {onColumnMove && (
                <button
                  type="button"
                  onPointerDown={(e) => beginDrag(e, col.key)}
                  onClick={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    const at = columns.findIndex((c) => c.key === col.key)
                    if (e.key === 'ArrowUp' && at > 0) {
                      e.preventDefault()
                      onColumnMove(col.key, columns[at - 1].key)
                    } else if (e.key === 'ArrowDown' && at < columns.length - 1) {
                      e.preventDefault()
                      onColumnMove(col.key, columns[at + 1].key)
                    }
                  }}
                  aria-label={`Move the ${col.label} column. Use the arrow keys.`}
                  className={`${DRAG_GRIP} ${dragging === col.key ? DRAG_GRIP_ACTIVE : ''} px-1`}
                >
                  <GripIcon />
                </button>
              )}
            </label>
          )
        })}
      </div>

    </div>,
    document.body,
  )
}

/** Two columns of dots: the standing picture for "drag this". */
function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="4" r="1.3" />
      <circle cx="10" cy="4" r="1.3" />
      <circle cx="6" cy="8" r="1.3" />
      <circle cx="10" cy="8" r="1.3" />
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="10" cy="12" r="1.3" />
    </svg>
  )
}
