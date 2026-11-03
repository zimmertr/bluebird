import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { popoverBox, type PopoverBox } from '../utils/listbox'
import { CHIP_MENU_GAP_PX } from '../utils/results/resultsSheet'
import { useExit } from './useExit'
import { useTakeOrphanedFocus } from './useFocusHandoff'

/**
 * A menu standing off its trigger: where it lands, when it is measured again,
 * and what closes it.
 *
 * One recipe, because there were four (#385). Every popover in the app had its
 * own copy of the placement call, the once-per-open measuring pass and the
 * dismiss listeners, and three of the four had been built by copying a fourth —
 * so a fix to one of them reached none of the others. Since record 0201 it
 * has one placement too: every desk menu stands where the Layers chip's card
 * does, 4px under its trigger.
 *
 * The maths stays in `utils/listbox.ts`, the pure half, which the node test
 * project checks case by case. This hook is the wiring around it, and
 * `components/Menu.test.tsx` renders it with the card every menu wears.
 */

// Between the trigger and the card: the Layers chip's 4px, which every menu
// takes (record 0201), so a gap that differed between two menus cannot read
// as one of them being misplaced. And between the card and the edge of the
// viewport or of its panel.
const GAP_PX = CHIP_MENU_GAP_PX
const VIEWPORT_MARGIN_PX = 8

// What a trigger's panel says it is, so a menu in it stays inside it
// (`popoverBox`'s `bound`): the control panel, docked or a phone's sheet.
const MENU_BOUND = 'data-menu-bound'

// A panel whose height cannot change while it is open measures once and stays
// put. Shared rather than a default array literal at the call, so the identity
// the measuring pass compares against does not change every render.
const ONCE_PER_OPEN: readonly unknown[] = []

// What Tab can land on inside a panel. Disabled controls and `tabIndex={-1}`
// are out, which is what makes the first and last of these the panel's two
// edges for the Tab handling below.
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

function tabbables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.tabIndex >= 0)
}

interface Options {
  open: boolean
  /** Called with `false` by Escape and by a press outside the panel. */
  onOpenChange: (open: boolean) => void
  /** The control the panel opens from, and the one press outside never means. */
  triggerRef: React.RefObject<HTMLElement | null>
  /**
   * What ELSE changes the panel's height while it is open. Each value here is
   * compared with the last measured one, and a change buys another measuring
   * pass.
   *
   * Empty is the deliberate default. A panel that re-places itself whenever its
   * rows change can jump from above its trigger to below it under the hand that
   * is pressing a row, which is worse than one that shrinks where it stands.
   * The exceptions are a panel that GROWS — `ModelPicker`'s chip row gains a
   * line as models are ticked — because that one hits its cap and starts
   * scrolling in a gap the viewport could have given it outright, and the
   * calendar, which grows a row of hour fields under Hourly and a sixth week
   * in some months.
   */
  remeasure?: readonly unknown[]
  /**
   * What takes the keyboard when the panel opens. Defaults to the panel's
   * first control; a list driven by `aria-activedescendant` names itself,
   * since it is not in the Tab order.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /**
   * What the panel is placed against, when that is not the trigger: the
   * calendar's slot under When, which holds its field when there is one and
   * stands empty where it would be when there is not. The trigger still takes
   * the keyboard back and is still exempt from a press outside.
   */
  anchorRef?: React.RefObject<HTMLElement | null>
  /**
   * An element whose width the card takes whatever its rows want: the Model
   * row for the model list, whose summaries would otherwise run it across the
   * map, the calendar's slot, and the Analyze button's slot for the message
   * list, whose longest line ran it over the map (#803). Without one a card
   * is its rows' width and never narrower than its trigger (record 0201).
   */
  widthRef?: React.RefObject<HTMLElement | null>
  /**
   * Controls whose press is not "outside", because the caller closes the
   * panel itself in the same press: the calendar's When segment (#687). Its
   * Current used to close the card on pointerdown and drop the Dates arm on
   * the click, a press later, so the card left a frame before the rest.
   */
  ownPressRef?: React.RefObject<HTMLElement | null>
  /**
   * Whether the keyboard goes into the panel as it opens, true unless a
   * caller says otherwise: the message list opened by a check or the basemap
   * failing (#834), which lands while the reader may be typing in a field and
   * must not take the keyboard from it. Turning true while the panel is open
   * takes it then, as a failed run does over a list already standing open.
   */
  takeFocus?: boolean
}

export function usePopover({
  open,
  onOpenChange,
  triggerRef,
  remeasure = ONCE_PER_OPEN,
  initialFocusRef,
  anchorRef,
  ownPressRef,
  widthRef,
  takeFocus = true,
}: Options): {
  popoverRef: React.RefObject<HTMLDivElement | null>
  /** Where the card stands while it is drawn, open or on its way out; null when there is no card. */
  box: PopoverBox | null
  /** Whether the card is on its way out, for `Menu`'s `closing` (`useExit`). */
  closing: boolean
} {
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
    (desiredHeight = Infinity, desiredWidth = 0) => {
      const trigger = (anchorRef ?? triggerRef).current
      if (!trigger) return
      const bound = trigger.closest(`[${MENU_BOUND}]`)?.getBoundingClientRect()
      const next = popoverBox(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        {
          gap: GAP_PX,
          margin: VIEWPORT_MARGIN_PX,
          desiredHeight,
          desiredWidth,
          width: widthRef?.current?.getBoundingClientRect().width,
          bound,
        },
      )
      // A box that says the same thing is the same box. Without this, every
      // scroll event anywhere on the page re-rendered an open panel to the
      // coordinates it was already at — and a scroll that does not move the
      // trigger is most of them, since the listener has to be in the capture
      // phase to hear a sidebar's own.
      setBox((prev) => (prev && sameBox(prev, next) ? prev : next))
    },
    [triggerRef, anchorRef, widthRef],
  )

  // Two passes, both before paint so neither is visible. The first asks for as
  // much room as the viewport can give, which lets the panel lay out at its
  // natural height and its rows' width; the second measures both and
  // re-places knowing them. Without the height the placement cannot tell
  // "taller than the gap" from "taller than the screen", and every panel would
  // scroll in the gap; without the width it cannot tell whether the card's
  // right edge would run past its panel.
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
    // already have capped the box at the viewport. `offsetWidth` rather than
    // the bounding box, since the card's entrance shifts its box while the
    // width it lays out at stays put.
    place(popover.scrollHeight, popover.offsetWidth)
  })

  // The trigger moves whenever something around it scrolls or the window
  // resizes, and a fixed-position panel does not follow it. Capture phase
  // because the scroll that matters is a sidebar's own, which does not bubble
  // to window.
  useEffect(() => {
    if (!open) return
    const follow = () => place(popoverRef.current?.scrollHeight ?? Infinity, popoverRef.current?.offsetWidth ?? 0)
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, true)
    return () => {
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, true)
    }
  }, [open, place])

  // The keyboard goes INTO the panel when it opens (#576). Every panel is
  // portalled to the end of the body, so one left on its trigger was reached
  // only after every link in the results table: 89 Tab stops at three rows.
  // Keyed on the panel being drawn rather than on `open`, because on the first
  // open the panel exists only a render after `open` turns true (it waits for
  // the placement above), and an [open]-keyed pass would find nothing to focus.
  const shown = open && box !== null
  useEffect(() => {
    if (!shown || !takeFocus) return
    const panel = popoverRef.current
    const target = initialFocusRef?.current ?? (panel ? tabbables(panel)[0] : undefined)
    target?.focus()
  }, [shown, initialFocusRef, takeFocus])

  // And back out to the trigger when it closes, by whatever route, if the
  // keyboard was inside. A closed card leaves over `MOTION.menu`'s 150ms
  // rather than at once, and `useExit` hands the keyboard back as it starts
  // to; this catches a card its caller stopped drawing in the same commit
  // (the calendar's, when Current takes the When segment), which unmounts
  // under the keyboard and would otherwise leave it on the body. A press on
  // something else keeps its focus, because then nothing was orphaned.
  const closing = useExit(open, popoverRef, triggerRef)
  useTakeOrphanedFocus(triggerRef, !open)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        onTab(e)
        return
      }
      if (e.key !== 'Escape') return
      onOpenChange(false)
      triggerRef.current?.focus()
    }

    // Tab past either edge of the panel closes it and hands the keyboard back
    // to the trigger. Left alone, Tab off the last row walks out of the end of
    // the document, since that is where the portal put the panel. A panel that
    // runs its own Tab order (`ModelPicker`'s chips and list) prevents the
    // default first, and its own handler has already run by the time the
    // event reaches the document.
    const onTab = (e: KeyboardEvent) => {
      const panel = popoverRef.current
      if (e.defaultPrevented || !panel || !panel.contains(document.activeElement)) return
      const items = tabbables(panel)
      const edge = e.shiftKey ? items[0] : items[items.length - 1]
      if (items.length > 0 && document.activeElement !== edge) return
      e.preventDefault()
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
      if (ownPressRef?.current?.contains(target)) return
      onOpenChange(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onOpenChange, triggerRef, ownPressRef])

  return { popoverRef, box: open || closing ? box : null, closing }
}

function sameSignals(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
}

function sameBox(a: PopoverBox, b: PopoverBox): boolean {
  if (a.width !== b.width || a.minWidth !== b.minWidth || a.maxWidth !== b.maxWidth) return false
  if (a.maxHeight !== b.maxHeight || a.placement !== b.placement) return false
  return sameEdge(a.align, b.align) && sameEdge(a.offset, b.offset)
}

// One key, never both, and which one it is depends on the placement — so the
// two are compared through the key each actually carries.
function sameEdge(a: Record<string, number>, b: Record<string, number>): boolean {
  const [key] = Object.keys(a)
  return key in b && a[key] === b[key]
}
