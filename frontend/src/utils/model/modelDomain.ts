// Whether a regional model reaches every place an analysis would forecast
// (#803, W8). A regional model refuses a location outside its grid, and one
// such location fails its whole batch of 50, so the run used to fail with the
// coverage sentence after it had spent. `/api/capabilities` now publishes each
// regional model's grid as `domain` (record 0233), and the gate holds the run
// before it starts, naming the model in the coverage sentence.
//
// Pure and apart from the gate so the node project checks the cases, and so
// the points are one input: the ring's vertices, the pasted rows and the pins
// today, and the found field once discovery is counted ahead of Analyze.

import type { MultiPolygon } from 'geojson'
import type { GeoPolygon } from '../../types'
import { pointInOutline } from '../fireProximity'

export interface LatLon {
  latitude: number
  longitude: number
}

/**
 * The label of the first model whose published domain leaves out any point,
 * or null when every model reaches every point.
 *
 * In the order given, which is `selectedIds`'s, the ranking model first, so the
 * line names the model that ranks before one that is only compared. A model
 * with no domain is global, or regional with an outline this deployment did
 * not publish; either way the browser holds nothing to test against, and
 * Open-Meteo's own refusal stays the check, as it was before #803.
 */
export function modelOutsideDomain(
  models: readonly { label: string; domain?: MultiPolygon | null }[],
  points: readonly LatLon[],
): string | null {
  for (const m of models) {
    const domain = m.domain
    if (!domain) continue
    if (points.some((p) => !pointInOutline(p.longitude, p.latitude, domain))) return m.label
  }
  return null
}

/**
 * Every point a domain is held against: the ring's vertices when the ring is
 * searched, and every row of the list.
 *
 * The vertices are conservative on purpose. A ring with a vertex outside the
 * grid reaches past it, and what it finds there is unknown until discovery
 * answers, so it is held even if every destination it would find stands
 * inside. A ring with no type checked searches nothing, so its vertices do
 * not count.
 */
export function analysisPoints(
  polygon: GeoPolygon | null,
  ringSearched: boolean,
  rows: readonly LatLon[],
): LatLon[] {
  const ring =
    polygon !== null && ringSearched
      ? (polygon.coordinates[0] ?? []).map(([longitude, latitude]) => ({ latitude, longitude }))
      : []
  return [...ring, ...rows]
}
