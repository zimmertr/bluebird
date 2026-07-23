import type { FeatureCollection } from 'geojson'
import { DestinationResult, SortBy } from '../types'
import { markerColor } from './colors'

// GeoJSON for the results markers. Exact coordinates live in BOTH places on
// purpose: the geometry positions the marker, but geometry read back from a
// *clicked* feature is snapped to the vector-tile grid (tens of metres when
// zoomed out), so it can't be trusted for the coordinate readout or — the bug
// this guards — the fireKey lookup that matches a marker to its fire warning.
// The popup therefore reads lat/lon from properties, which pass through intact.
export function resultsFeatureCollection(
  results: DestinationResult[],
  sortBy: SortBy,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        name: r.name,
        rank: String(i + 1),
        // Carried through so the popup's external link (destinationUrl) can be
        // built on a marker click, matching the table's name-cell link.
        type: r.type,
        ...(r.osm_id != null ? { osm_id: r.osm_id } : {}),
        // Exact coordinates for the readout and the fireKey warning lookup —
        // see the note above on why geometry can't be used for those.
        lat: r.latitude,
        lon: r.longitude,
        // Sorting by AQI can hit rows with no AQI data (beyond its ~5-day
        // horizon) — those get a neutral gray instead of a metric color.
        color: r[sortBy] == null ? '#64748b' : markerColor(r[sortBy] as number, sortBy),
        precip: r.precip_total_in,
        elevation_ft: r.elevation_ft,
        // Raw numbers; resultPopupHtml formats them (and the click handler reads
        // them straight back from the feature, so they must stay numeric).
        wind_avg: r.wind_avg_mph,
        temp_avg: r.temp_avg_f,
        ...(r.aqi_avg != null ? { aqi_avg: r.aqi_avg, aqi_max: r.aqi_max } : {}),
      },
    })),
  }
}
