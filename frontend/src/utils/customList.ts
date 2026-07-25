import { CustomDestination } from '../types'
import { Place } from './geocode'

// ~1 m precision — enough to match a backend-echoed coordinate back to its
// source row, and to treat a re-search of the same feature as an update, not
// a duplicate.
export function pinKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

// The full custom side of an analysis: pasted CSV rows ∪ searched places, as
// one deduped list for the ranked request. A searched place wins a coordinate
// collision — it carries identity (kind, OSM id) and often an elevation the
// CSV line lacks.
export function buildCustomList(
  csvRows: CustomDestination[],
  places: Place[],
): CustomDestination[] {
  const placeKeys = new Set(places.map((p) => pinKey(p.lat, p.lon)))
  const csvKept = csvRows.filter((r) => !placeKeys.has(pinKey(r.latitude, r.longitude)))
  const fromPlaces = places.map((p) => ({
    name: p.label,
    latitude: p.lat,
    longitude: p.lon,
    elevation_ft: p.elevationFt,
  }))
  return [...csvKept, ...fromPlaces]
}
