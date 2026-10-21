import { useCallback, useEffect, useLayoutEffect, useState, type TransitionEvent } from 'react'
import { PANEL_MS } from '../styles'
import { prefersReducedMotion } from '../utils/motion'

// How long a pane's frame may take past its transition before a closing pane
// unmounts anyway: the end event never comes where nothing ran (jsdom, a tab
// in the background, a transition another press cut short).
const UNMOUNT_SLACK_MS = 50

/** What one results pane is doing, and what its frame and body read. */
export interface PaneMotion {
  /** Whether the frame stands open (`RESULTS_PANE.open`) or shut. */
  open: boolean
  /** Whether the pane's grip and body are mounted: while shown, and while it closes. */
  mounted: boolean
  /** The body's height: the pane's own while shown, the last one while it closes. */
  px: number
  /** Unmounts a closed body once its frame has finished closing. */
  onTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void
}

/**
 * A results pane's life across a Table, Chart or Both press, or the collapse
 * chevron, at a desk (#714; record 0202). The frame opens from nothing to the
 * body's height and closes back, at the panel's speed, the same both ways.
 *
 * An opening pane mounts its body in the press's commit, at the height the
 * layout gives the mode pressed, so the chart is drawn once, at its final
 * size, and the frame uncovers it as it opens: the reader sees the rows and
 * the lines come in with the pane. A closing pane keeps its body, at the
 * height it had, until its frame is shut, so the data is there as it goes.
 *
 * Only a press or the chevron moves the frame: its grid row is `1fr` whenever
 * the pane is open, so a grip's drag, a double press and a window's resize
 * change the body under a row that does not change, and nothing chases the
 * pointer. A phone's panes and the first render change at once (`animated`
 * false), and a reduced-motion setting unmounts a closing body at once.
 *
 * `kept` is whether the body stays mounted: set once the pane is shown, and
 * cleared by the closing frame's end. Set in an effect or by that end rather
 * than while rendering, for the reason `useLayoutMotion` gives: an update made
 * while rendering can be dropped, and a pane shown again would then lose its
 * body.
 */
export function usePaneMotion(shown: boolean, px: number, animated: boolean): PaneMotion {
  const [kept, setKept] = useState(shown)
  const [heldPx, setHeldPx] = useState(px)
  // The height a closing body keeps: the last one it had while shown.
  if (shown && px !== heldPx) setHeldPx(px)
  const closing = !shown && kept

  // A shown pane keeps its body from now on, so a press that hides it again
  // before its frame has opened shuts the frame around it. Where nothing
  // animates a hidden body goes before the paint.
  useLayoutEffect(() => {
    if (shown && !kept) setKept(true)
    else if (closing && (!animated || prefersReducedMotion())) setKept(false)
  }, [shown, kept, closing, animated])

  // The fallback for an end event that never comes.
  useEffect(() => {
    if (!closing || !animated) return
    const timer = window.setTimeout(() => setKept(false), PANEL_MS + UNMOUNT_SLACK_MS)
    return () => window.clearTimeout(timer)
  }, [closing, animated])

  // The frame's own row, not a colour fading on a control inside it, and only
  // while a body waits on it.
  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && closing) setKept(false)
    },
    [closing],
  )

  return { open: shown, mounted: animated ? shown || kept : shown, px: shown ? px : heldPx, onTransitionEnd }
}

/**
 * `value` as it stood in the last render where `holding` was false: what a
 * closing chart was drawn with, kept while its frame shuts. Tracked while
 * rendering, as `heldPx` above is, because a dropped update here costs at
 * most a body held one render old.
 */
export function useHeldWhile<T>(value: T, holding: boolean): T {
  const [held, setHeld] = useState(value)
  if (!holding && !Object.is(held, value)) setHeld(value)
  return holding ? held : value
}
