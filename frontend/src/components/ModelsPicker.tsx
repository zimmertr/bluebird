import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { popoverBox, PopoverBox } from '../utils/listbox'
import { visibilityRows, type VisibilityModel } from '../utils/modelVisibility'
import { CHOICE_INPUT, CHOICE_ROW, LAYER, RADIUS, SURFACE_CARD } from '../styles'

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
 * already answers one way. Built from `ColumnsPicker`'s parts rather than a
 * second recipe — the same `popoverBox` placement, the same dismissal, the same
 * `CHOICE_ROW`/`CHOICE_INPUT` rows — so the two read as one control.
 *
 * It hides lines and nothing else. Every forecast behind it is already bought,
 * so a box here spends nothing either way, and nothing it does reaches the
 * link, the ranking, the table or the file.
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
  const popoverRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<PopoverBox | null>(null)
  // Whether this open has had its measuring pass yet — see ColumnsPicker.
  const measuredRef = useRef(false)

  function place(desiredHeight = Infinity) {
    const trigger = triggerRef.current
    if (!trigger) return
    setBox(
      popoverBox(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        { preferredWidth: 256, gap: 4, margin: 8, desiredHeight },
      ),
    )
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The measuring pass, run after EVERY commit rather than keyed on `open`, for
  // the sequencing reason ColumnsPicker records: the trigger lives in App and
  // only flips `open`, so the popover does not exist yet when an [open]-keyed
  // pass would run. The ref is what stops the loop.
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

    // Pointerdown rather than click: a click that lands on something which
    // unmounts under it never reaches document, and the picker would stay open.
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
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1">
        {visibilityRows(models, hidden).map((row) => (
          <label key={row.id} className={CHOICE_ROW}>
            <input
              type="checkbox"
              checked={row.visible}
              onChange={() => onToggle(row.id)}
              className={CHOICE_INPUT}
            />
            {/* The swatch the chart's hover box gives a line. The RANKING
                model's row keeps the slot and draws nothing in it: its lines
                are not one colour, each wears its own destination's, so a
                square here would name a colour no line is drawn in — and a
                dropped slot would put its label 14px left of every other. */}
            <span
              aria-hidden="true"
              className={`h-2.5 w-2.5 flex-shrink-0 ${RADIUS.control} ${
                row.color === null ? 'invisible' : ''
              }`}
              style={row.color === null ? undefined : { backgroundColor: row.color }}
            />
            <span className="flex-1">{row.label}</span>
          </label>
        ))}
      </div>
    </div>,
    document.body,
  )
}
