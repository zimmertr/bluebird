import type { FeatureCollection } from 'geojson'
import { DestinationResult, SortBy } from '../types'
import { colorOnScale, hourlyScale, markerColor } from './colors'
import { valueAt } from './chartData'
import { familyOf } from '../metrics'

// Sorting by AQI can hit rows with no AQI data (beyond its ~5-day horizon), and
// scrubbing playback past that horizon hits the same gap an hour at a time.
// Both get the neutral gray rather than a metric color, so "no answer" never
// looks like a good one.
const NO_VALUE = '#64748b'

/**
 * A marker's fill: the ranked window value, or one hour of it during playback.
 *
 * The two read different scales, and must. A ranking bins a window — a total
 * for precipitation, an average for the rest — while a playback tick is one
 * hour, and for precipitation those are different quantities entirely (see
 * `hourlyScale`). `valueAt` is the chart's own reader, so the hour a marker is
 * colored for is the hour the chart draws at the same playhead.
 */
function fillColor(row: DestinationResult, sortBy: SortBy, hourIndex: number | null): string {
  if (hourIndex !== null) {
    const value = valueAt(row, familyOf(sortBy), hourIndex)
    return value == null ? NO_VALUE : colorOnScale(value, hourlyScale(sortBy))
  }
  return row[sortBy] == null ? NO_VALUE : markerColor(row[sortBy] as number, sortBy)
}

/**
 * The arrow's rotation for one hour, or no property at all.
 *
 * Open-Meteo reports the direction the wind blows FROM; the arrow points the
 * way it is going, which is the reading a person brings to an arrow on a map.
 * Hence the half turn.
 *
 * Omitted rather than defaulted when the hour has no bearing — a row from the
 * SSE fallback, which never fetched direction, or a gap in the series. The
 * arrow layer filters on the property's presence, so an absent key is what
 * draws nothing; a 0 would draw a confident arrow pointing north.
 */
function bearingAt(row: DestinationResult, hourIndex: number): { bearing?: number } {
  const from = row.series?.wind_dir_deg?.[hourIndex]
  if (from == null || !Number.isFinite(from)) return {}
  return { bearing: (from + 180) % 360 }
}

// GeoJSON for the results markers. Exact coordinates live in BOTH places on
// purpose: the geometry positions the marker, but geometry read back from a
// *clicked* feature is snapped to the vector-tile grid (tens of metres when
// zoomed out), so it can't be trusted for the coordinate readout or — the bug
// this guards — the fireKey lookup that matches a marker to its fire warning.
// The popup therefore reads lat/lon from properties, which pass through intact.
export function resultsFeatureCollection(
  results: DestinationResult[],
  sortBy: SortBy,
  // Ranked results carry a 1-based rank (shown in the marker and popup title).
  // Searched destinations are unranked (outside the sort/limit) — pass false so
  // their markers and popups omit the "#N" entirely.
  ranked = true,
  // The forecast hour the markers are colored for, or null for the window
  // aggregate the ranking used (#121). An index into the report's own hourly
  // grid, so the map and the chart's playhead read the same column.
  hourIndex: number | null = null,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: results.map((r, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        name: r.name,
        rank: ranked ? String(i + 1) : '',
        // Carried through so the popup's external link (destinationUrl) can be
        // built on a marker click, matching the table's name-cell link.
        type: r.type,
        ...(r.osm_id != null ? { osm_id: r.osm_id } : {}),
        // Exact coordinates for the readout and the fireKey warning lookup —
        // see the note above on why geometry can't be used for those.
        lat: r.latitude,
        lon: r.longitude,
        color: fillColor(r, sortBy, hourIndex),
        // Where the arrow layer points during wind playback, and the reason it
        // is a feature property rather than feature-state: `icon-rotate` is a
        // LAYOUT property, and layout properties cannot read feature-state at
        // all — the same class of silent MapLibre refusal as the point-placed
        // symbol on a line geometry that cost #229 an afternoon. Setting the
        // source is what already re-ranks the markers, so a rotation rides on
        // it for free.
        ...(hourIndex !== null ? bearingAt(r, hourIndex) : {}),
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
