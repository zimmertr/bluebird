import { useCallback, useEffect, useLayoutEffect, useState, type TransitionEvent } from 'react'
import { PANEL_MS } from '../styles'
import { prefersReducedMotion } from '../utils/motion'
import type { ResultsMode } from '../utils/viewPrefs'

/**
 * Which edge of a desk's layout is moving: the panel opening or closing, or a
 * results pane opening or closing on a press or the collapse chevron. Null
 * while nothing moves.
 */
export type LayoutMotion = 'opening' | 'closing' | 'panes' | null

// The two properties a layout move transitions (`MOTION.push`, `MOTION.pane`).
const MOVES = new Set(['margin-left', 'grid-template-rows'])

// How long a move may run before the hold lets go without its end event,
// which never comes for a transition another press cut short.
const FALLBACK_MS = PANEL_MS * 3

/**
 * Whether a desk's layout is moving (#714; record 0202). While the panel
 * pushes the map's edge or a results pane opens or closes, on a press or the
 * collapse chevron, the map's box and the panes' bodies hold one size
 * (`LAYOUT_HOLD`, `usePaneMotion`), so a frame of the move moves boxes rather
 * than redrawing the map, the table or the chart; each is drawn at its new
 * size once, where the move starts or where it ends.
 *
 * The motion is the difference between the layout the props ask for and the
 * one the last move settled at, worked out while rendering, so the hold lands
 * in the commit that starts the move. It is derived rather than set during
 * rendering because React can drop an update made while rendering: when a
 * lower-priority update to the same state waits in its queue (a move's end
 * that came after the fallback had already let go is one), the next render at
 * that priority starts again from before the update, and the move would run
 * unheld, resizing the map in every frame.
 *
 * Settled by the move's own `transitionend`, which bubbles to the root the
 * caller hands `onTransitionEnd` to, or after `FALLBACK_MS`. Never moving on a
 * phone, where nothing pushes, nor under a reduced-motion setting, where
 * nothing moves; there the settled layout follows the props.
 */
export function useLayoutMotion({
  isDesktop,
  open,
  mode,
  collapsed = false,
}: {
  isDesktop: boolean
  /** Whether the controls panel is open. */
  open: boolean
  /** The results mode drawn. */
  mode: ResultsMode
  /** Whether the results are collapsed to their bar. */
  collapsed?: boolean
}) {
  const [settled, setSettled] = useState({ open, mode, collapsed })
  const animate = isDesktop && !prefersReducedMotion()
  const moved = settled.open !== open || settled.mode !== mode || settled.collapsed !== collapsed
  const motion: LayoutMotion =
    !animate || !moved ? null : settled.open !== open ? (open ? 'opening' : 'closing') : 'panes'

  // Where nothing animates, no end event comes to settle the layout.
  useLayoutEffect(() => {
    if (!animate && moved) setSettled({ open, mode, collapsed })
  }, [animate, moved, open, mode, collapsed])

  useEffect(() => {
    if (motion === null) return
    const timer = window.setTimeout(() => setSettled({ open, mode, collapsed }), FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [motion, open, mode, collapsed])

  // Only while something moves: a second end, the other pane's frame in Chart
  // to Table, finds the layout settled already.
  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLElement>) => {
      if (moved && MOVES.has(e.propertyName)) setSettled({ open, mode, collapsed })
    },
    [moved, open, mode, collapsed],
  )

  return { motion, onTransitionEnd }
}
