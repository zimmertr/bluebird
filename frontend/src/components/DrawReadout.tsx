import { STATUS } from '../styles'

// The points a ring needs before it is an area: Done and Enter wait for it,
// and the Analyze gate reads the same floor.
const RING_POINTS = 3

interface Props {
  drawPointCount: number
  /**
   * Keep the count on one line. The panel does, because the area shares the
   * line and moves under it whole rather than splitting the count (#687); the
   * phone's draw bar does not, where Done and Cancel take the rest of a 360px
   * line and the long state has to be free to wrap.
   */
  whole?: boolean
}

/**
 * The ring's point count while an area is drawn: the panel's Destinations
 * section and the phone's draw bar (#687) both render this, so the two
 * cannot come to say different things about the same ring.
 *
 * Three states (record 0306): before the first point it says what to do, then
 * how far the ring is from an area, then both ways to finish.
 *
 * It sets a colour and no size: each place it stands in sets the size around
 * it, the panel its caption step and the bar the control size.
 */
export default function DrawReadout({ drawPointCount, whole = false }: Props) {
  const line = whole ? ' whitespace-nowrap' : ''
  if (drawPointCount === 0) {
    return <p className={`${STATUS.info}${line}`}>Press the map to place points</p>
  }
  if (drawPointCount < RING_POINTS) {
    return (
      <p className={`${STATUS.info}${line}`}>
        {drawPointCount} of {RING_POINTS} points placed
      </p>
    )
  }
  // Both ways to finish are named because Analyze closes the ring and leaves
  // draw mode as Done does (`useAnalyzeCommand`), and a line naming Done alone
  // read as if Analyze were running on a ring still being drawn.
  return (
    <p className={`${STATUS.ok} font-medium${line}`}>
      {drawPointCount} points placed. Press Done or Analyze.
    </p>
  )
}
