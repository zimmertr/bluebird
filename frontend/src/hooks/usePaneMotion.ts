import { useCallback, useEffect, useLayoutEffect, useState, type TransitionEvent } from 'react'
import { PANEL_MS } from '../styles'
import { prefersReducedMotion } from '../utils/motion'

// How long a pane's frame may take past its transition before the pane
// settles anyway: the end event never comes where nothing ran (jsdom, a tab
// in the background, a transition another press cut short).
const SETTLE_SLACK_MS = 50

/** What one results pane is doing, and what its frame and body read. */
export interface PaneMotion {
  /** Whether the frame stands open (`RESULTS_PANE.open`) or shut. */
  open: boolean
  /** Whether the pane's grip and its box are mounted: while shown, and while it closes. */
  mounted: boolean
  /**
   * Whether the pane's body, the chart or the table, is mounted: once the
   * frame has opened, and while it closes.
   */
  ready: boolean
  /** The box's height: the pane's own while shown, the last one while it closes. */
  px: number
  /** The body's height, which holds while a pane moves (`moving`). */
  drawnPx: number
  /** Settles the pane once its frame has finished opening or closing. */
  onTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void
}

/**
 * A results pane's life across a Table, Chart or Both press, or the collapse
 * chevron, at a desk (#714; record 0202). The frame opens from nothing to the
 * box's height and closes back, at the panel's speed, the same both ways.
 *
 * What the frame carries is light. An opening pane mounts its grip and an
 * empty box of its height at the press, and its body, the chart or the table,
 * once the frame has opened: at 946 rows the chart's mount took 498ms and the
 * table's 719ms, and in the press's commit that was a wait before anything
 * moved (2026-10-21). A closing
 * pane keeps its body, at the height it had, until its frame is shut.
 *
 * While a pane moves (`moving`, from `useLayoutMotion`) a mounted body keeps
 * the height it was drawn at (`drawnPx`), and its box clips it, so the chart
 * is drawn and the table laid out once, where the move ends.
 *
 * Only a press or the chevron moves the frame: its grid row is `1fr` whenever
 * the pane is open, so a grip's drag, a double press and a window's resize
 * change the box under a row that does not change, and nothing chases the
 * pointer. A phone's panes and the first render change at once (`animated`
 * false), and so does everything under a reduced-motion setting.
 *
 * `settled` is whether the pane was shown when its last move ended, and the
 * body is mounted while it says so. `boxed` is whether the frame has begun to
 * open since, so a pane hidden again before its frame had opened keeps its
 * box until the frame is shut. A move's end or an effect sets both, never a
 * render, for the reason `useLayoutMotion` gives: an update made while
 * rendering can be dropped, and a pane shown again would then lose its body.
 */
export function usePaneMotion(shown: boolean, px: number, animated: boolean, moving = false): PaneMotion {
  const [settled, setSettled] = useState(shown)
  const [boxed, setBoxed] = useState(shown)
  const [heldPx, setHeldPx] = useState(px)
  // The height a closing box keeps: the last one it had while shown.
  if (shown && px !== heldPx) setHeldPx(px)
  const boxPx = shown ? px : heldPx
  // The height the body was drawn at, which a move does not change. It
  // follows the box whenever nothing moves or no body is mounted, so a body
  // that mounts mid-move is drawn at the box's height and holds that.
  const ready = animated ? settled : shown
  const drawnPx = useHeldWhile(boxPx, moving && ready)

  const pending = settled !== shown || boxed !== shown
  const settle = useCallback(() => {
    setSettled(shown)
    setBoxed(shown)
  }, [shown])

  // Where nothing animates, no end event comes to settle the pane, so it
  // settles before the paint and the body mounts in the press's frame.
  // Elsewhere a frame that has begun to open keeps its box from here on.
  useLayoutEffect(() => {
    if (pending && (!animated || prefersReducedMotion())) settle()
    else if (shown && !boxed) setBoxed(true)
  }, [pending, animated, settle, shown, boxed])

  // The fallback for an end event that never comes.
  useEffect(() => {
    if (!pending || !animated) return
    const timer = window.setTimeout(settle, PANEL_MS + SETTLE_SLACK_MS)
    return () => window.clearTimeout(timer)
  }, [pending, animated, settle])

  // The frame's own row, not a colour fading on a control inside it.
  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && pending) settle()
    },
    [pending, settle],
  )

  return {
    open: shown,
    mounted: animated ? shown || boxed : shown,
    ready,
    px: boxPx,
    drawnPx,
    onTransitionEnd,
  }
}

/**
 * `value` as it stood in the last render where `holding` was false: what a
 * pane's body was drawn with, kept while the pane moves. Tracked while
 * rendering, as `heldPx` above is, because a dropped update here costs at
 * most a body held at a height one render old.
 */
export function useHeldWhile<T>(value: T, holding: boolean): T {
  const [held, setHeld] = useState(value)
  if (!holding && !Object.is(held, value)) setHeld(value)
  return holding ? held : value
}
