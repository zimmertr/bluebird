import { useGripDrag } from '../hooks/useGripDrag'
import { type CSSProperties, useState } from 'react'
import { CHART_GUTTER, RESIZE_GRIP } from '../styles'
import { HANDLE_ATTR } from '../hooks/useStretchDrag'

// Marks a handle a chart split drag moves by transform (#499).
const HANDLE_MARK = { [HANDLE_ATTR]: '' }

interface ResizeGripProps {
  /** A double press: put this grip's own panel back to its default height. */
  onReset: () => void
  /** A drag has begun. The panel being dragged against is pinned here. */
  onDragStart: () => void
  /** The drag so far, with up positive. */
  onDrag: (dragUpPx: number) => void
  /** The pointer is up, cancelled, or gone. */
  onDragEnd: () => void
  /**
   * Drawn as the chart grid's gutter rather than the raised bar (TJ
   * 2026-10-30): a desk's stacked chart panels, so every desk layout's bars
   * are one quiet line. The results area's grips and a phone's keep the bar,
   * which a finger needs to find.
   */
  line?: boolean
}

// The line stands in the stack's flow, 8px tall, where a gutter stands over a gap.
const IN_FLOW = { position: 'relative', width: '100%', flexShrink: 0 } as const

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
export default function ResizeGrip({ onReset, onDragStart, onDrag, onDragEnd, line = false }: ResizeGripProps) {
  const [dragging, setDragging] = useState(false)
  const handlePointerDown = useGripDrag({
    onReset,
    onDragStart: () => {
      setDragging(true)
      onDragStart()
    },
    onDrag,
    onDragEnd: () => {
      setDragging(false)
      onDragEnd()
    },
  })
  if (line) {
    return (
      <div {...HANDLE_MARK} onPointerDown={handlePointerDown} className={CHART_GUTTER.row} style={IN_FLOW}>
        <div className={`${CHART_GUTTER.rowLine} ${dragging ? CHART_GUTTER.active : CHART_GUTTER.idle}`} />
        <Knob axis="row" dragging={dragging} />
      </div>
    )
  }

  return (
    <div {...HANDLE_MARK} onPointerDown={handlePointerDown} className={RESIZE_GRIP.bar}>
      <div className={RESIZE_GRIP.pill} />
    </div>
  )
}

interface GridGutterProps {
  /** Which split it moves: the columns', the rows', or both where the gutters cross. */
  axis: 'col' | 'row' | 'both'
  /** Where it stands in its grid, as CSS lengths from the grid's top left. */
  place: CSSProperties
  /** Its accessible name. */
  label: string
  /** A double press: even its axis back out. */
  onReset: () => void
  onDragStart: () => void
  /** The drag so far, right and down positive. */
  onDrag: (dx: number, dy: number) => void
  onDragEnd: () => void
  /**
   * Where along the bar its grips stand, as CSS lengths from its start: one
   * at the middle of each stretch between crossings, so no grip lands on a
   * crossing's dot (TJ 2026-10-30). The middle when left out.
   */
  knobs?: readonly string[]
}

const MIDDLE = ['50%'] as const

/**
 * A gutter of the chart's grid of three or four panels, as its handle (#499;
 * TJ 2026-10-29): the vertical one drags the columns, the horizontal one the
 * rows, and the square where they cross drags both. Beside `ResizeGrip` and
 * on the same gesture (`useGripDrag`), so the grid shares one press clock and
 * one way a drag is read. The line lights while it is dragged as well as
 * under the pointer, because the pointer leaves an 8px gutter mid-drag.
 */
export function GridGutter({ axis, place, label, onReset, onDragStart, onDrag, onDragEnd, knobs = MIDDLE }: GridGutterProps) {
  const [dragging, setDragging] = useState(false)
  const handlePointerDown = useGripDrag({
    onReset,
    onDragStart: () => {
      setDragging(true)
      onDragStart()
    },
    onDrag: (upPx, rightPx) => onDrag(axis === 'row' ? 0 : rightPx, axis === 'col' ? 0 : -upPx),
    onDragEnd: () => {
      setDragging(false)
      onDragEnd()
    },
  })
  if (axis === 'both') {
    return (
      <div {...HANDLE_MARK} role="separator" aria-label={label} onPointerDown={handlePointerDown} className={CHART_GUTTER.cross} style={place}>
        <span className={`${CHART_GUTTER.crossDot} ${dragging ? CHART_GUTTER.crossActive : CHART_GUTTER.crossIdle}`} />
      </div>
    )
  }
  const line = axis === 'col' ? CHART_GUTTER.colLine : CHART_GUTTER.rowLine
  return (
    <div
      {...HANDLE_MARK}
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'col' ? 'vertical' : 'horizontal'}
      onPointerDown={handlePointerDown}
      className={axis === 'col' ? CHART_GUTTER.col : CHART_GUTTER.row}
      style={place}
    >
      <div className={`${line} ${dragging ? CHART_GUTTER.active : CHART_GUTTER.idle}`} />
      {knobs.map((at) => (
        <Knob key={at} axis={axis} dragging={dragging} at={at} />
      ))}
    </div>
  )
}

/** The three-dot grip at a bar's middle (option B, TJ 2026-10-30). */
function Knob({ axis, dragging, at = '50%' }: { axis: 'col' | 'row'; dragging: boolean; at?: string }) {
  const dot = `${CHART_GUTTER.knobDot} ${dragging ? CHART_GUTTER.active : CHART_GUTTER.idle}`
  return (
    <span
      aria-hidden="true"
      style={axis === 'col' ? { top: at } : { left: at }}
      className={`${CHART_GUTTER.knob} ${axis === 'col' ? CHART_GUTTER.knobCol : CHART_GUTTER.knobRow}`}
    >
      <span className={dot} />
      <span className={dot} />
      <span className={dot} />
    </span>
  )
}
