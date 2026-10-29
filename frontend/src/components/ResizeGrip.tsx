import { useGripDrag } from '../hooks/useGripDrag'
import { CHART_PANEL_BUTTON, RADIUS, TAP } from '../styles'

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
      className={`${TAP.grip} flex-shrink-0 h-2 flex items-center justify-center cursor-ns-resize touch-none bg-raised border-t border-b border-frame hover:bg-raised-hover transition-colors group`}
    >
      <div
        className={`w-10 h-0.5 ${RADIUS.pill} bg-edge group-hover:bg-ink-mid transition-colors`}
      />
    </div>
  )
}

interface GridKnobProps {
  /** Where the knob stands in its grid, as CSS lengths from the grid's top left. */
  left: string
  top: string
  /** Its accessible name. */
  label: string
  /** A double press: even the grid back out. */
  onReset: () => void
  onDragStart: () => void
  /** The drag so far, right and down positive. */
  onDrag: (dx: number, dy: number) => void
  onDragEnd: () => void
}

/**
 * The one control that resizes the chart's grid of three or four panels
 * (#499): a knob where the gutters cross, which moves both splits at once.
 * Beside `ResizeGrip` and on the same gesture (`useGripDrag`), so the two
 * share one press clock and one way a drag is read.
 */
export function GridKnob({ left, top, label, onReset, onDragStart, onDrag, onDragEnd }: GridKnobProps) {
  const handlePointerDown = useGripDrag({
    onReset,
    onDragStart,
    onDrag: (upPx, rightPx) => onDrag(rightPx, -upPx),
    onDragEnd: () => onDragEnd(),
  })
  return (
    <div
      role="separator"
      aria-label={label}
      onPointerDown={handlePointerDown}
      className={CHART_PANEL_BUTTON.knob}
      style={{ left, top }}
    />
  )
}
