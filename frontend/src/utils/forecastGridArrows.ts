// The forecast grid's wind arrows: one point per sampled cell, at the cell's
// centre, carrying the bearing the timeline's current hour reads.

import type { FeatureCollection } from 'geojson'
import { bearingAt } from './resultFeatures'
import type { GridCell } from './forecastGridLattice'

/**
 * The per-sample wind arrows, as points at each sample's coordinate.
 *
 * Separate from the raster because they are a second encoding on the same data
 * and MapLibre has no way to draw a symbol per texel. Reads `bearingAt` — the
 * markers' own derivation — rather than mirroring it, so the FROM-to-toward
 * half turn and the absent-bearing omission are defined once for both layers.
 * Empty unless playback is scrubbing, which is the only time an hour has a
 * direction to point in.
 */
export function gridArrowFeatures(
  cells: readonly GridCell[],
  hourIndex: number | null,
): FeatureCollection {
  if (hourIndex === null) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: cells.flatMap(({ box, row }) => {
      const bearing = bearingAt(row, hourIndex)
      if (bearing.bearing === undefined) return []
      const [w, s, e, n] = box
      return [
        {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [(w + e) / 2, (s + n) / 2] },
          properties: bearing,
        },
      ]
    }),
  }
}
