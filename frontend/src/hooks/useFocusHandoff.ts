import { useLayoutEffect, type RefObject } from 'react'

/**
 * Where the keyboard goes when the control holding it goes away (#576).
 *
 * A pressed button that unmounts, turns disabled or lands inside an `inert`
 * drawer takes the focus with it, and the browser parks it on `<body>`: the
 * next Tab starts again from the top of the page. Draw polygon, Analyze, Close
 * controls and every popover's last row all did that. The fix is the same in
 * each place, so it is one rule here: the control that REPLACES the pressed
 * one takes the focus, and only when the focus really was lost.
 *
 * "Lost" needs the element that last had focus, because `<body>` alone cannot
 * tell a reader whose button vanished from a reader who clicked the map, or
 * from a page nobody has touched yet. Stealing focus in either of those would
 * be worse than the bug. So the module listens for `focusin` once and keeps
 * the last element focused; focus is orphaned when that element can no longer
 * hold it and nothing usable holds it instead.
 */

let lastFocused: Element | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    lastFocused = e.target instanceof Element ? e.target : null
  })
}

/** Out of the document, inside an inert subtree, or disabled. */
function unusable(el: Element): boolean {
  return !el.isConnected || el.closest('[inert]') !== null || el.matches(':disabled')
}

/** Focus was on something a reader put it on, and that thing can no longer hold it. */
export function focusOrphaned(): boolean {
  const active = document.activeElement
  if (active && active !== document.body && !unusable(active)) return false
  return lastFocused !== null && (active === lastFocused || unusable(lastFocused))
}

/**
 * Take the focus if it was orphaned. Shaped as a ref callback, so a control
 * that MOUNTS in the pressed one's place can wear it as `ref={takeOrphanedFocus}`
 * and take the keyboard in the commit that drew it.
 */
export function takeOrphanedFocus(el: HTMLElement | null): void {
  if (el && !unusable(el) && focusOrphaned()) el.focus()
}

/**
 * The same, for a control that was there all along and becomes the right place
 * when `when` turns true: the Analyze button as a run ends, a drawer's close
 * button as it opens, a popover's trigger as it closes. Layout rather than
 * passive, so the focus has landed before the browser paints the frame.
 */
export function useTakeOrphanedFocus(ref: RefObject<HTMLElement | null>, when: boolean): void {
  useLayoutEffect(() => {
    if (when) takeOrphanedFocus(ref.current)
  }, [when, ref])
}
