import { DestinationResult } from '../types'

// Where a result row's name links to. Peakbagger has no OSM-id mapping, so
// peaks use its coordinate radius search — results are distance-ordered, which
// puts the clicked peak first — rather than the name search, which is ambiguous
// for common names ("Black Peak" matches 30+ peaks). Crags go to a Mountain
// Project search by name, where a climber looks a crag up, rather than to the
// OSM object (the maintainer, 2026-10-15, #715). Verified 2026-10-15:
// `search?q=Lower%20Town%20Wall` lists the area (/area/105790643/lower-town-wall)
// in its Areas section. Everything else deep-links to the exact OSM object the
// row came from; rows without one (custom/pinned destinations) fall back to an
// OSM map pin at the coordinates.
export function destinationUrl(
  row: Pick<DestinationResult, 'name' | 'type' | 'latitude' | 'longitude' | 'osm_id'>
): string {
  const lat = row.latitude.toFixed(5)
  const lon = row.longitude.toFixed(5)
  if (row.type === 'peak') {
    return `https://www.peakbagger.com/search.aspx?tid=R&lat=${lat}&lon=${lon}`
  }
  if (row.type === 'crag') {
    return `https://www.mountainproject.com/search?q=${encodeURIComponent(row.name)}`
  }
  if (row.osm_id) {
    return `https://www.openstreetmap.org/${row.osm_id}`
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`
}

/**
 * What a screen reader hears for the link `destinationUrl` builds: the site it
 * opens, since the card's glyph shows none (#738). Follows the same type
 * rule, so the name and the place cannot disagree.
 */
export function destinationLinkLabel(type: DestinationResult['type']): string {
  if (type === 'peak') return 'View on Peakbagger'
  if (type === 'crag') return 'View on Mountain Project'
  return 'View on OpenStreetMap'
}
