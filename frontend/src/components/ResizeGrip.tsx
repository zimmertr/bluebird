import { useRef } from 'react'
import { RADIUS, TAP } from '../styles'

// How close two presses must be to count as a double-click. The browser's own
// dblclick never arrives on these grips: the resize begins on pointerdown and
// preventDefault plus the drag overlay stop the pair of clicks ever resolving,
// so the gesture is recognised here instead. 350ms is a shade over the usual
// system threshold, which is the right way to miss.
const DOUBLE_PRESS_MS = 350

interface ResizeGripProps {
  /** A double press: put this grip's own panel back to its default height. */
  onReset: () => void
  /** A drag has begun. The panel being dragged against is pinned here. */
  onDragStart: () => void
  /** The drag so far, with up positive. */
  onDrag: (dragUpPx: number) => void
  /** The pointer is up, cancelled, or gone. */
  onDragEnd: () => void
}

/**
 * The bar between two panels, and the two gestures it answers: drag to resize,
 * double press to put the panel back.
 *
 * One component for both of the results area's grips (#382). They are the same
 * affordance with different geometry behind them, and the geometry is the
 * caller's: the chart grip trades against the map, the table grip against the
 * chart in Both mode and against the map alone. Only the gesture lives here.
 *
 * Each grip keeps its own press clock, which is what makes a double press
 * reset the panel it was made on rather than both — a drag only ever moved one.
 *
 * The listeners go on the document rather than the element: a resize that
 * stopped tracking the moment the pointer left a 8px bar would be unusable.
 * Pointer Events carry mouse and touch alike, which is what lets one handler
 * serve both breakpoints.
 */
export default function ResizeGrip({ onReset, onDragStart, onDrag, onDragEnd }: ResizeGripProps) {
  const lastPressRef = useRef(0)

  function handlePointerDown(e: React.PointerEvent) {
    const at = e.timeStamp
    const previous = lastPressRef.current
    lastPressRef.current = at
    if (at - previous < DOUBLE_PRESS_MS) {
      onReset()
      return
    }

    e.preventDefault()
    const startY = e.clientY
    onDragStart()

    function onMove(ev: PointerEvent) {
      onDrag(startY - ev.clientY)
    }

    function onUp() {
      onDragEnd()
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      className={`${TAP.grip} flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-slate-700 border-t border-b border-slate-600 hover:bg-slate-600 transition-colors group`}
    >
      <div
        className={`w-10 h-0.5 ${RADIUS.pill} bg-slate-500 group-hover:bg-slate-300 transition-colors`}
      />
    </div>
  )
}
