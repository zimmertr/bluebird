/**
 * The ground under the points the map's cards describe (#832): a ranked
 * marker's, a clicked label's, a pending dot's and a right-clicked spot's.
 * Each card asks for its point as it draws and redraws when the read lands,
 * so every card reads one slope at one point, and a point is read once a
 * session however many cards open on it: the ground does not change while
 * the page is open.
 *
 * The read is `groundReading`'s, at the finest tile Mapterhorn holds, off the
 * one elevation source the terrain rows load (`terrain.ts`), so a card opened
 * with no terrain row on loads the same chunk a switch would and no second
 * one. Mapterhorn's credit stands in the map's corner while any card that
 * reads it is open, which CC BY 4.0 asks for wherever the data is shown.
 */
import { isAbort } from '../utils/abort'
import type { GroundState } from '../utils/popup/groundFact'
import { geoKey } from '../utils/points'
import { groundReading } from './slope'
import type { TerrainLayers } from './terrain'

export interface GroundReadings {
  /** What is known of the ground at a point, its read started the first time it is asked. */
  at(lat: number, lon: number): GroundState
  /** Calls `redraw` whenever a read lands, so the open cards draw it. */
  onRead(redraw: () => void): void
  /** Holds the credit for one open card; the function returned lets it go, once. */
  hold(): () => void
}

const NOTHING: GroundState = { kind: 'none' }
const PENDING: GroundState = { kind: 'pending' }

export function createGroundReadings(
  terrain?: Pick<TerrainLayers, 'demTiles' | 'credit'>,
  read: typeof groundReading = groundReading,
): GroundReadings {
  const known = new Map<string, GroundState>()
  const redraws: (() => void)[] = []
  // A read is never aborted: a card that closes before it lands leaves an
  // answer the next card on the point can use.
  const life = new AbortController()

  function land(key: string, state: GroundState) {
    known.set(key, state)
    for (const redraw of redraws) redraw()
  }

  return {
    at(lat, lon) {
      if (!terrain) return NOTHING
      const key = geoKey(lat, lon)
      const held = known.get(key)
      if (held) return held
      known.set(key, PENDING)
      terrain
        .demTiles()
        .then((dem) => read(dem, lat, lon, life))
        .then(
          (reading) => land(key, reading ? { kind: 'read', reading } : NOTHING),
          (err: unknown) => {
            // Open ocean has no tile at any zoom, and a failed fetch says
            // nothing about the ground: either way the card says nothing of
            // it. Kept, so a redraw does not ask again in a loop.
            if (!isAbort(err)) console.warn('Ground under the point failed to load', err)
            land(key, NOTHING)
          },
        )
      return PENDING
    },
    onRead(redraw) {
      redraws.push(redraw)
    },
    hold() {
      if (!terrain) return () => {}
      terrain.credit(true)
      let held = true
      return () => {
        if (!held) return
        held = false
        terrain.credit(false)
      }
    },
  }
}
