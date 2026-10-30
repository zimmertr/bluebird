import { useGripDrag } from '../hooks/useGripDrag'
import { RESIZE_GRIP } from '../styles'

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
    <div onPointerDown={handlePointerDown} className={RESIZE_GRIP.bar}>
      <div className={RESIZE_GRIP.pill} />
    </div>
  )
}
