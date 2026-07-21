import { DestinationResult } from '../types'

// Where a result row's name links to. Peakbagger has no OSM-id mapping, so
// peaks use its coordinate radius search — results are distance-ordered, which
// puts the clicked peak first — rather than the name search, which is ambiguous
// for common names ("Black Peak" matches 30+ peaks). Everything else deep-links
// to the exact OSM object the row came from; rows without one (custom/pinned
// destinations) fall back to an OSM map pin at the coordinates.
export function destinationUrl(
  row: Pick<DestinationResult, 'type' | 'latitude' | 'longitude' | 'osm_id'>
): string {
  const lat = row.latitude.toFixed(5)
  const lon = row.longitude.toFixed(5)
  if (row.type === 'peak') {
    return `https://www.peakbagger.com/search.aspx?tid=R&lat=${lat}&lon=${lon}`
  }
  if (row.osm_id) {
    return `https://www.openstreetmap.org/${row.osm_id}`
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`
}
