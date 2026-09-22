import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { popoverBox, type PopoverBox } from '../utils/listbox'

/**
 * A panel hanging off a trigger: where it lands, when it is measured again, and
 * what closes it.
 *
 * One recipe, because there were four (#385). Every popover in the app had its
 * own copy of the placement call, the once-per-open measuring pass and the
 * dismiss listeners, and three of the four had been built by copying a fourth —
 * so a fix to one of them reached none of the others.
 *
 * The maths stays in `utils/listbox.ts`, the pure half, which the node test
 * project checks case by case. This hook is the wiring around it, and
 * `components/Popover.test.tsx` renders it once for every panel that wears it.
 */

// Between the trigger and the panel, and between the panel and the edge of the
// viewport. One pair for the app rather than one per popover: a gap that
// differed between two panels would read as one of them being misplaced.
const GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8

// What a list of labels asks for, and what the results bar's three pickers take.
// A panel whose rows carry prose needs more and says so: `ModelPicker` passes
// its own measured width.
const LIST_WIDTH_PX = 256

// A panel whose height cannot change while it is open measures once and stays
// put. Shared rather than a default array literal at the call, so the identity
// the measuring pass compares against does not change every render.
const ONCE_PER_OPEN: readonly unknown[] = []

interface Options {
  open: boolean
  /** Called with `false` by Escape and by a press outside the panel. */
  onOpenChange: (open: boolean) => void
  /** The control the panel hangs off, and the one press outside never means. */
  triggerRef: React.RefObject<HTMLElement | null>
  preferredWidth?: number
  /**
   * What ELSE changes the panel's height while it is open. Each value here is
   * compared with the last measured one, and a change buys another measuring
   * pass.
   *
   * Empty is the deliberate default. A panel that re-places itself whenever its
   * rows change can jump from above its trigger to below it under the hand that
   * is pressing a row, which is worse than one that shrinks where it stands.
   * The exception is a panel that GROWS — `ModelPicker`'s chip row gains a line
   * as models are ticked — because that one hits its cap and starts scrolling
   * in a gap the viewport could have given it outright.
   */
  remeasure?: readonly unknown[]
}

export function usePopover({
  open,
  onOpenChange,
  triggerRef,
  preferredWidth = LIST_WIDTH_PX,
  remeasure = ONCE_PER_OPEN,
}: Options): { popoverRef: React.RefObject<HTMLDivElement | null>; box: PopoverBox | null } {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<PopoverBox | null>(null)
  // What `remeasure` held when this open was last measured, or null while the
  // panel is closed.
  const measuredRef = useRef<readonly unknown[] | null>(null)

  // Stable as long as the trigger and the width are, which is what lets every
  // effect below name it honestly. As a plain function in a component body it
  // was a new identity every render, so naming it cost a re-place per render.
  // The three pickers that take their trigger as a PROP had no way out of that:
  // two carried a standing lint error and the third a suppression.
  const place = useCallback(
    (desiredHeight = Infinity) => {
      const trigger = triggerRef.current
      if (!trigger) return
      const next = popoverBox(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        {
          preferredWidth,
          gap: GAP_PX,
          margin: VIEWPORT_MARGIN_PX,
          desiredHeight,
        },
      )
      // A box that says the same thing is the same box. Without this, every
      // scroll event anywhere on the page re-rendered an open panel to the
      // coordinates it was already at — and a scroll that does not move the
      // trigger is most of them, since the listener has to be in the capture
      // phase to hear a sidebar's own.
      setBox((prev) => (prev && sameBox(prev, next) ? prev : next))
    },
    [triggerRef, preferredWidth],
  )

  // Two passes, both before paint so neither is visible. The first asks for as
  // much room as the viewport can give, which lets the panel lay out at its
  // natural height; the second measures that height and re-places knowing it.
  // Without the measurement the placement cannot tell "taller than the gap"
  // from "taller than the screen", and every panel would scroll in the gap.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  // The second pass, run after EVERY commit rather than keyed on `open`. The
  // panel cannot render until the pass above has set a box, so an [open]-keyed
  // pass ran before the element existed, measured nothing, and the unmeasured
  // fallback stuck for the whole open — while every later open rendered early
  // against the previous open's stale box and got measured, which is exactly
  // the "wrong once, right afterwards" bug. The ref is what stops the loop:
  // place() sets state, which lands back here.
  useLayoutEffect(() => {
    if (!open) {
      measuredRef.current = null
      return
    }
    const popover = popoverRef.current
    if (!popover) return
    const measured = measuredRef.current
    if (measured && sameSignals(measured, remeasure)) return
    measuredRef.current = remeasure
    // `scrollHeight` rather than the bounding box, since the first pass may
    // already have capped the box at the viewport.
    place(popover.scrollHeight)
  })

  // The trigger moves whenever something around it scrolls or the window
  // resizes, and a fixed-position panel does not follow it. Capture phase
  // because the scroll that matters is a sidebar's own, which does not bubble
  // to window.
  useEffect(() => {
    if (!open) return
    const follow = () => place(popoverRef.current?.scrollHeight ?? Infinity)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onOpenChange(false)
      triggerRef.current?.focus()
    }

    // Pointerdown rather than click, for two reasons that both end in a panel
    // that will not close: a click landing on something which unmounts under it
    // never reaches document, and a press that starts outside has to dismiss
    // before the map treats it as a gesture. The trigger is exempt so its own
    // toggle does not fire close-then-reopen — and on a phone, where the panel
    // lands on top of the trigger, that press hits the panel and keeps it open,
    // which is why anywhere-outside has to dismiss.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      onOpenChange(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onOpenChange, triggerRef])

  return { popoverRef, box }
}

function sameSignals(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
}

function sameBox(a: PopoverBox, b: PopoverBox): boolean {
  if (a.left !== b.left || a.width !== b.width || a.maxHeight !== b.maxHeight) return false
  if (a.placement !== b.placement) return false
  // One key, never both, and which one it is depends on the placement — so the
  // two are compared through the key each actually carries.
  return 'top' in a.offset
    ? 'top' in b.offset && a.offset.top === b.offset.top
    : 'bottom' in b.offset && a.offset.bottom === b.offset.bottom
}
