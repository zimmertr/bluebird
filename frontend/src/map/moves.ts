/**
 * The camera's framing moves, and the two things the tutorial (#536) asks of
 * them on its demo copy of the app.
 *
 * Every fit and flight in `MapView` goes through `run`, which does two jobs
 * only the tutorial ever sets. Insets keep a subject clear of the tutorial's
 * card, the way the results sheet's share of the bottom edge already keeps it
 * clear of the sheet. Instant makes a move take no time at all, for a step the
 * reader hurried past or one played again. Both are read when a move is made,
 * never passed as props, so the memoized `MapView` renders nothing for them.
 *
 * `hurry` ends a move already under way where it was going to land: the last
 * move is kept as a function of its duration and made again with none.
 */
import type * as maplibregl from 'maplibre-gl'
import { type Insets, NO_INSETS } from '../utils/mapFraming'

export interface CameraMoves {
  /** What the camera must leave clear on each edge, on top of its own padding. */
  readonly insets: Insets
  setInsets(insets: Insets): void
  setInstant(instant: boolean): void
  /** Makes a move that takes `ms`, or none while instant. */
  run(ms: number, move: (duration: number) => void): void
  /** Lands a move under way now, where it was going. */
  hurry(map: maplibregl.Map): void
}

export function createCameraMoves(): CameraMoves {
  let insets = NO_INSETS
  let instant = false
  let last: ((duration: number) => void) | null = null
  return {
    get insets() {
      return insets
    },
    setInsets(next) {
      insets = next
    },
    setInstant(next) {
      instant = next
    },
    run(ms, move) {
      last = move
      move(instant ? 0 : ms)
    },
    hurry(map) {
      if (last && map.isMoving()) last(0)
    },
  }
}
