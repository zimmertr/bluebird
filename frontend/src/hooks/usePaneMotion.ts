import { useLayoutEffect, useState } from 'react'

/** What one results pane is doing, and what its frame and body read. */
export interface PaneMotion {
  /** Whether the frame stands open (`RESULTS_PANE.open`) or shut. */
  open: boolean
  /** Whether the pane's grip and body are mounted: while shown, and at a desk once shown, shut or not. */
  mounted: boolean
  /** The body's height: the pane's own while shown, the last one while shut. */
  px: number
}

/**
 * A results pane's life across a Table, Chart or Both press, or the collapse
 * chevron, at a desk (#714, #786; records 0202, 0216). The frame opens from
 * nothing to the body's height and closes back, at the panel's speed, the
 * same both ways.
 *
 * A body is mounted the first time its pane is shown and stays mounted while
 * the pane is shut, at the height it last had, so a press opens a frame
 * around a body already drawn rather than drawing one in the frame the move
 * starts in: mounting a 62-row table held that frame 50 to 80 ms on a 120 Hz
 * Mac (2026-10-22). The reader sees the rows and the lines come in with the
 * pane, and go with it. A shut body draws nothing new until its pane opens
 * (`Held` in `ResultsPanels`), and is inert.
 *
 * Only a press or the chevron moves the frame: its grid row is `1fr` whenever
 * the pane is open, so a grip's drag, a double press and a window's resize
 * change the body under a row that does not change, and nothing chases the
 * pointer. A phone's panes change at once and are mounted only while shown
 * (`animated` false).
 *
 * `kept` is set in an effect rather than while rendering, for the reason
 * `useLayoutMotion` gives: an update made while rendering can be dropped, and
 * a shut pane would then lose its body.
 */
export function usePaneMotion(shown: boolean, px: number, animated: boolean): PaneMotion {
  const [kept, setKept] = useState(shown)
  const [heldPx, setHeldPx] = useState(px)
  // The height a shut body keeps: the last one it had while shown.
  if (shown && px !== heldPx) setHeldPx(px)

  useLayoutEffect(() => {
    if (shown && !kept) setKept(true)
  }, [shown, kept])

  return { open: shown, mounted: shown || (animated && kept), px: shown ? px : heldPx }
}

/**
 * `value` as it stood in the last render where `holding` was false: what a
 * shut chart was drawn with, kept while its frame shuts. Tracked while
 * rendering, as `heldPx` above is, because a dropped update here costs at
 * most a body held one render old.
 */
export function useHeldWhile<T>(value: T, holding: boolean): T {
  const [held, setHeld] = useState(value)
  if (!holding && !Object.is(held, value)) setHeld(value)
  return holding ? held : value
}
