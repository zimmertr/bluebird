import { useGripDrag } from '../hooks/useGripDrag'
import { RADIUS, TAP } from '../styles'

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
 * chart in Both mode and against the map alone. The gesture is
 * `useGripDrag`'s, which a phone sheet's grip takes too (#696).
 */
export default function ResizeGrip({ onReset, onDragStart, onDrag, onDragEnd }: ResizeGripProps) {
  const handlePointerDown = useGripDrag({ onReset, onDragStart, onDrag, onDragEnd: () => onDragEnd() })

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
