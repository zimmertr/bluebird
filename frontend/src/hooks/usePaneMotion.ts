import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject, type TransitionEvent } from 'react'
import { PANEL_MS } from '../styles'
import { prefersReducedMotion } from '../utils/motion'

// How long a closing pane waits past its transition before it unmounts
// anyway: the end event never comes where nothing ran (jsdom, a tab in the
// background, a transition another press cut short).
const UNMOUNT_SLACK_MS = 50

/** What one results pane is doing, and what its frame and body read. */
export interface PaneMotion {
  /** The pane's frame, which `MOTION.pane` opens and closes. */
  ref: RefObject<HTMLDivElement | null>
  /** Whether the pane's body is mounted: while shown, and while it closes. */
  mounted: boolean
  /** Whether the frame stands open (`RESULTS_PANE.open`) or shut. */
  open: boolean
  /** The body's height: the panel's own while shown, the last one while it closes. */
  px: number
  /** Unmounts a closed body once its frame has finished closing. */
  onTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void
}

/**
 * A results pane's life across a Table, Chart or Both press at a desk (#714;
 * record 0201). The frame opens from nothing to the body's height and closes
 * back, at the panel's speed, the same both ways; the body keeps its own
 * height throughout, so the chart draws once rather than once a frame, and a
 * closing body stays mounted, at the height it had, until its frame is shut.
 *
 * Only the press moves: the frame's grid row is `1fr` whenever the pane is
 * open, so a grip's drag, a double press and a window's resize change the
 * body's height under a row that does not change, and nothing chases the
 * pointer. A phone's panes and the first render change at once (`animated`
 * false), and a reduced-motion setting unmounts a closing body at once.
 *
 * `settled` is whether the pane was shown when its last move ended; the body
 * is mounted while either says so and the frame open while both do. Derived
 * rather than set while rendering, for the reason `useLayoutMotion` gives: an
 * update made while rendering can be dropped, and a pane shown again would
 * then lose its body.
 */
export function usePaneMotion(shown: boolean, px: number, animated: boolean): PaneMotion {
  const ref = useRef<HTMLDivElement>(null)
  const [settled, setSettled] = useState(shown)
  const [heldPx, setHeldPx] = useState(px)
  // The height a closing body keeps: the last one it had while shown.
  if (shown && px !== heldPx) setHeldPx(px)
  const mounted = animated ? shown || settled : shown
  const open = animated ? shown && settled : shown

  // A pane that just mounted shut is opened in the same paint, after the
  // browser has its shut frame to transition from; where nothing animates the
  // settled state simply follows.
  useLayoutEffect(() => {
    if (settled === shown) return
    if (shown) {
      if (animated && !prefersReducedMotion()) ref.current?.getBoundingClientRect()
      setSettled(true)
    } else if (!animated) setSettled(false)
  }, [shown, settled, animated])

  // The fallback for an end event that never comes; at once under a
  // reduced-motion setting, where no transition runs.
  useEffect(() => {
    if (shown || !settled || !animated) return
    const timer = window.setTimeout(
      () => setSettled(false),
      prefersReducedMotion() ? 0 : PANEL_MS + UNMOUNT_SLACK_MS,
    )
    return () => window.clearTimeout(timer)
  }, [shown, settled, animated])

  // The frame's own row, not a colour fading on a control inside it, and only
  // while a body waits on it.
  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !shown && settled) setSettled(false)
    },
    [shown, settled],
  )

  return { ref, mounted, open, px: shown ? px : heldPx, onTransitionEnd }
}
