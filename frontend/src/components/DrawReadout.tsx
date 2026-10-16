import { STATUS } from '../styles'

interface Props {
  /** Whether the map is in draw mode, which is when the readout names a gesture. */
  drawing: boolean
  drawPointCount: number
  /** How many more points the ring needs, the same reading the Analyze gate takes. */
  pointsNeeded: number
  /**
   * Keep the count on one line. The panel does, because the area shares the
   * line and moves under it whole rather than splitting the count (#687); the
   * phone's draw bar does not, where Done and Cancel take the rest of a 360px
   * line and the long state has to be free to wrap.
   */
  whole?: boolean
}

/**
 * The ring's point count, in the words the panel has always used: the panel's
 * Polygon block and the phone's draw bar (#687) both render this, so the two
 * cannot come to say different things about the same ring.
 *
 * It sets a colour and no size: each place it stands in sets the size around
 * it, the panel its caption step and the bar the control size.
 */
export default function DrawReadout({ drawing, drawPointCount, pointsNeeded, whole = false }: Props) {
  const line = whole ? ' whitespace-nowrap' : ''
  // Only while drawing does the status name a gesture: outside the mode the
  // handles are gone and none of them apply.
  if (drawing && pointsNeeded > 0) {
    return (
      <p className={`${STATUS.info}${line}`}>
        {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed,{' '}
        {pointsNeeded} more needed.
      </p>
    )
  }
  // Both ways to finish are named because Analyze closes the ring and leaves
  // draw mode as Done does (`useAnalyzeCommand`), and a line naming Done alone
  // read as if Analyze were running on a ring still being drawn.
  if (drawing) {
    return (
      <p className={`${STATUS.ok} font-medium${line}`}>
        {drawPointCount} points placed. Press Done or Analyze.
      </p>
    )
  }
  return (
    <p className={`${pointsNeeded > 0 ? STATUS.info : `${STATUS.ok} font-medium`}${line}`}>
      {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed
      {pointsNeeded > 0 && `, ${pointsNeeded} more needed`}
    </p>
  )
}
