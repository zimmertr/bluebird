/**
 * A row's centring flight, flown again when the canvas is resized while it is
 * in the air (#714; record 0202).
 *
 * `flyTo` fixes the pixel it carries its target to when it starts, in the
 * canvas's own pixels, and holds the target there to the end whatever the
 * canvas does meanwhile. At a desk the map's canvas is resized where a layout
 * move ends (`useLayoutMotion`), and the box it held through the move is
 * centred on the map's column, so the resize moves the canvas's origin: the
 * pixel at the middle of the held box is below the column's foot once the
 * box is the column again. A row pressed in the half second after a report
 * landed flew its marker there, under the results, with its card off the map.
 *
 * No target chosen at the press is right on both sides of that resize, so the
 * flight is flown again after it: from where the camera stands, to the target
 * placed for the canvas as it now stands, in the time the first flight had
 * left, so it lands when that one would have. The screen point it heads for is
 * the same one, since the held box and the column share a centre. Only while
 * it is in the air: a flight that has landed, that another camera move has
 * stopped, or that the reader's hand has taken over is forgotten at its
 * `moveend`, so a resize never moves a camera at rest.
 */
import type * as maplibregl from 'maplibre-gl'

export interface Centring {
  /**
   * Fly with `aim`, which places the target for the canvas as it stands and
   * flies there in the time it is given. A cut (0ms) is not kept: it has
   * landed before any resize can come.
   */
  fly(map: maplibregl.Map, durationMs: number, aim: (durationMs: number) => void): void
  /** Fly a centring still in the air again, for the canvas as it now stands. */
  reaim(): void
}

interface Flight {
  map: maplibregl.Map
  aim: (durationMs: number) => void
  endsAt: number
}

export function createCentring(now: () => number = () => performance.now()): Centring {
  let flight: Flight | null = null

  const fly = (map: maplibregl.Map, durationMs: number, aim: (durationMs: number) => void) => {
    // Cleared before the new flight starts, because starting it stops the one
    // in the air, whose `moveend` comes inside `aim`.
    flight = null
    aim(durationMs)
    if (durationMs <= 0) return
    const mine: Flight = { map, aim, endsAt: now() + durationMs }
    flight = mine
    const landed = () => {
      map.off('moveend', landed)
      if (flight === mine) flight = null
    }
    map.on('moveend', landed)
  }

  return {
    fly,
    reaim() {
      if (flight === null) return
      const left = flight.endsAt - now()
      if (left > 0) fly(flight.map, left, flight.aim)
      else flight = null
    },
  }
}
