import { CustomDestination } from '../types'
import { Place } from './geocode'

// ~1 m precision — enough to match a backend-echoed coordinate back to its
// source row, and to treat a re-search of the same feature as an update, not
// a duplicate.
export function pinKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

// A custom destination plus the bits only the UI needs: where it came from
// (a CSV row is removed by editing the textarea, so it gets no × ) and the
// geocoded identity a searched place carries.
export interface PendingDestination extends CustomDestination {
  kind?: string
  osmId?: string
  source: 'csv' | 'search'
}

// The custom side of an analysis: pasted CSV rows ∪ searched places, deduped by
// coordinate. A searched place wins a collision — it carries identity (kind,
// OSM id) and often an elevation the CSV line lacks.
function mergeCustom(csvRows: CustomDestination[], places: Place[]): PendingDestination[] {
  const placeKeys = new Set(places.map((p) => pinKey(p.lat, p.lon)))
  const fromCsv: PendingDestination[] = csvRows
    .filter((r) => !placeKeys.has(pinKey(r.latitude, r.longitude)))
    .map((r) => ({ ...r, source: 'csv' }))
  const fromPlaces: PendingDestination[] = places.map((p) => ({
    name: p.label,
    latitude: p.lat,
    longitude: p.lon,
    elevation_ft: p.elevationFt,
    kind: p.kind,
    osmId: p.osmId,
    source: 'search',
  }))
  return [...fromCsv, ...fromPlaces]
}

// The same list narrowed to the wire shape. Deliberately re-projected rather
// than passed through: this is the `custom_destinations` request body, and the
// OpenAPI contract shouldn't quietly grow the UI-only fields above.
export function buildCustomList(
  csvRows: CustomDestination[],
  places: Place[],
): CustomDestination[] {
  return mergeCustom(csvRows, places).map(({ name, latitude, longitude, elevation_ft }) => ({
    name,
    latitude,
    longitude,
    elevation_ft,
  }))
}

// Custom destinations no analysis has covered yet — freshly pasted, freshly
// searched, or waiting on the first run. Drawn as neutral pending dots and
// un-forecasted table rows so pasting a CSV gives the same immediate feedback a
// search does, instead of leaving the map empty until an analysis returns.
//
// `analyzed` is the custom set the last completed analysis covered, NOT the
// rows on screen. Keying off the rows was the #205 bug: they are the top-`limit`
// cut, so every added destination that ranked below the cut came back as an
// un-forecasted row claiming it had never been fetched, while its forecast sat
// in the held field the whole time. `limit` trims what is shown, never what is
// analyzed, and pending has to mean the same thing or the two disagree on
// screen. A destination the analysis covered but the display drops — below the
// cut, outside the elevation band — is simply not shown, like any other row the
// knobs exclude.
export function pendingDestinations(
  csvRows: CustomDestination[],
  places: Place[],
  analyzed: ReadonlySet<string>,
  removed: Set<string>,
): PendingDestination[] {
  return mergeCustom(csvRows, places).filter((d) => {
    const key = pinKey(d.latitude, d.longitude)
    // `removed` carries the weight for CSV rows: × on a searched place also
    // deregisters it, but a CSV row's text stays in the textarea, so without
    // this it would reappear as a dot the moment it left the report.
    return !analyzed.has(key) && !removed.has(key)
  })
}
