import { BUTTON_ACCENT, BUTTON_SECONDARY, CONTROL_SIZE, DISABLED, DRAW_BAR } from '../styles'
import { transportBottomPx } from '../utils/resultsSheet'
import DrawReadout from './DrawReadout'

interface Props {
  drawPointCount: number
  /** Keeps the ring and leaves draw mode: the panel's Done. */
  onDone: () => void
  /** Puts back the ring the mode started with and leaves it: the panel's Cancel. */
  onCancel: () => void
  /** How far the phone sheet covers the map's bottom edge, which the bar stands above. */
  liftPx: number
}

/**
 * The draw bar on a phone (#687): the panel's own readout, Done and Cancel,
 * on the map while a ring is drawn.
 *
 * Draw polygon closes the drawer on a phone, because the drawer covers the map
 * the ring is drawn on, and that left the map with the vertices and no way to
 * finish but reopening Controls. Done and Cancel here are the panel's two
 * presses, wired to the same two callbacks (record 0063's Cancel: the ring the
 * mode started with comes back), so the bar adds no behaviour of its own.
 * Clear stays in the panel: it starts the ring over without leaving the mode,
 * and the bar is for leaving it.
 *
 * It stands where the forecast player does, which `MapStage` leaves out while
 * the bar is up: playback is no use while points are being placed, and two
 * bars in one band would cover each other.
 */
export default function MapDrawBar({ drawPointCount, onDone, onCancel, liftPx }: Props) {
  return (
    <div
      // A popup keeps clear of the bar, as it does of the player.
      data-map-overlay=""
      className={DRAW_BAR}
      // Derived for the player's reason: the room the scale bar and the
      // attribution need, measured from whatever the bar stands on.
      style={{ bottom: transportBottomPx(liftPx) }}
    >
      <div className={`${CONTROL_SIZE} min-w-0 flex-1`}>
        {drawPointCount > 0 && (
          <DrawReadout drawing drawPointCount={drawPointCount} pointsNeeded={Math.max(0, 3 - drawPointCount)} />
        )}
      </div>
      {/* Disabled until the ring is a polygon, as the panel's Done is. */}
      <button onClick={onDone} disabled={drawPointCount < 3} className={`${BUTTON_ACCENT} ${DISABLED} flex-shrink-0`}>
        Done
      </button>
      <button onClick={onCancel} className={`${BUTTON_SECONDARY} flex-shrink-0`}>
        Cancel
      </button>
    </div>
  )
}
