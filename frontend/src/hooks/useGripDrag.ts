import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { type DragSample, releaseVelocity } from '../utils/sheetDrag'

// How close two presses must be to count as a double press. The browser's own
// dblclick never arrives on a grip: the drag begins on pointerdown and
// preventDefault plus the drag overlay stop the pair of clicks ever resolving,
// so the gesture is recognised here instead. 350ms is a shade over the usual
// system threshold, which is the right way to miss.
export const DOUBLE_PRESS_MS = 350

// The pointer's raw updates where the browser sends them (#499): Chromium
// fires `pointerrawupdate` as each movement arrives rather than once a frame,
// so a drag's frame reads the latest position. Elsewhere, `pointermove`.
const MOVE = typeof window !== 'undefined' && 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove'

export interface GripDragHandlers {
  /** A double press: put what this grip moves back to its own height. */
  onReset: () => void
  /** A drag has begun. */
  onDragStart: () => void
  /**
   * The drag so far, with up positive, and how far right it has gone, which
   * only the chart's grid gutters read (#499).
   */
  onDrag: (dragUpPx: number, dragRightPx: number) => void
  /**
   * The pointer is up, cancelled, or gone, with the drag's last distance and
   * how fast it was moving when let go (px per ms, up positive), which is
   * what tells a flick from a drag that stopped.
   */
  onDragEnd: (dragUpPx: number, velocityUp: number) => void
}

/**
 * The grip gesture, drag to move and double press to put back (#382), as
 * one pointerdown handler. The results sheet's two grips take it through
 * `ResizeGrip`, and every phone sheet's grip and title take it through
 * `useSheetDrag` (#696), so a phone has one way a grip answers a finger.
 *
 * Each caller keeps its own press clock, which is what makes a double press
 * reset what it was made on rather than every grip's. The listeners go on the
 * document rather than the element: a drag that stopped tracking the moment
 * the pointer left an 8px bar would be unusable. Pointer Events carry mouse
 * and touch alike, which is what lets one handler serve both breakpoints.
 */
export function useGripDrag(handlers: GripDragHandlers) {
  const lastPressRef = useRef(Number.NEGATIVE_INFINITY)
  // Read at event time, so a handler built in this render is the one called.
  const latest = useRef(handlers)
  latest.current = handlers

  return function onPointerDown(e: ReactPointerEvent) {
    const at = e.timeStamp
    const previous = lastPressRef.current
    lastPressRef.current = at
    if (at - previous < DOUBLE_PRESS_MS) {
      latest.current.onReset()
      return
    }

    e.preventDefault()
    const startY = e.clientY
    const startX = e.clientX
    const samples: DragSample[] = [{ at, upPx: 0 }]
    let last: DragSample = samples[0]
    latest.current.onDragStart()

    function onMove(ev: PointerEvent) {
      last = { at: ev.timeStamp, upPx: startY - ev.clientY }
      samples.push(last)
      latest.current.onDrag(last.upPx, ev.clientX - startX)
    }

    function onUp(ev: PointerEvent) {
      const end = ev.type === 'pointercancel' ? last : { at: ev.timeStamp, upPx: startY - ev.clientY }
      latest.current.onDragEnd(end.upPx, ev.type === 'pointercancel' ? 0 : releaseVelocity(samples, end))
      document.removeEventListener(MOVE, onMove as EventListener)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener(MOVE, onMove as EventListener)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }
}
