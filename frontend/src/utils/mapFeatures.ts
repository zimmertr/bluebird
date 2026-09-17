/**
 * What the map's markers carry, in both directions: pending destinations on
 * their way out as GeoJSON, and a clicked marker's properties read back in as
 * a row.
 *
 * Here rather than in `MapView.tsx` for the reason every module beside it is:
 * Vitest runs with no DOM and MapLibre needs a canvas, so a helper declared in
 * that component is unreachable from every test in this suite (#383). In a
 * module of its own rather than with the drawing rules because neither of these
 * concerns the ring, and a module's name is the first thing that says where a
 * decision lives.
 */
import type { FeatureCollection } from 'geojson'
import type { DestinationResult } from '../types'
import type { PendingDestination } from './customList'

/**
 * A clicked marker's properties read back as a row.
 *
 * Only reached when the click cannot be matched to a row in the report, which
 * `results-circles` being the popup's one layer makes close to unreachable —
 * it is the guard rather than the path. The feature carries the handful of
 * values the markers themselves need, so every other column reads undefined,
 * and `popupRows.ts` draws those as the dash it draws any missing value as.
 *
 * The coordinates are arguments rather than properties because the caller has
 * the exact pair and the feature does not: a rendered feature's geometry is
 * snapped to the tile grid.
 */
export function featureRow(
  p: Record<string, unknown>,
  latitude: number,
  longitude: number,
): DestinationResult {
  return {
    name: p.name as string,
    type: p.type as DestinationResult['type'],
    osm_id: (p.osm_id as string) ?? null,
    latitude,
    longitude,
    elevation_ft: (p.elevation_ft as number) ?? null,
    precip_total_in: p.precip as number,
    wind_avg_mph: p.wind_avg as number,
    temp_avg_f: p.temp_avg as number,
    freeze_min_ft: (p.freeze_min as number) ?? null,
    aqi_avg: (p.aqi_avg as number) ?? null,
    aqi_max: (p.aqi_max as number) ?? null,
  } as DestinationResult
}

// Minimal features for pending custom destinations — just position + name
// label. There is no forecast to color or rank by yet.
export function pendingFC(pending: PendingDestination[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pending.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: { name: d.name },
    })),
  }
}
