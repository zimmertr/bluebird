import { DestinationResult } from '../types'
import { destinationUrl } from './destinationUrl'
import { FireWarning, fireWarningText } from './fireProximity'

// Popup body shared by a marker click and a table-rank click (focusResult), so
// the two never drift. Values arrive raw; all formatting — and the coordinate
// line — lives here. Kept in utils (like wildfirePopupHtml) so the markup is
// unit-testable without pulling maplibre-gl into the test.
export function resultPopupHtml(d: {
  rank: number | string
  name: string
  type: DestinationResult['type']
  osmId: string | null
  elevationFt: number | null
  precipTotalIn: number
  windAvgMph: number
  tempAvgF: number
  aqiAvg: number | null
  aqiMax: number | null
  longitude: number
  latitude: number
  // Nearest active wildfire within the warn radius, or null. Mirrors the ⚠️ the
  // results table shows so a point clicked on the map surfaces the same alert.
  warning: FireWarning | null
}): string {
  // External link (Peakbagger for peaks, OSM otherwise) as a link icon to the
  // right of the title, mirroring the results table's name cell.
  const url = destinationUrl({
    type: d.type,
    latitude: d.latitude,
    longitude: d.longitude,
    osm_id: d.osmId,
  })
  const linkIcon = `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Open in Peakbagger / OpenStreetMap" style="color:#38bdf8;flex-shrink:0;display:inline-flex">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>`
  // Fire-proximity alert, matching the table's ⚠️. The incident name inside the
  // text is third-party NIFC data rendered via setHTML, so it's escaped.
  const fire = d.warning
    ? `<div style="color:#f59e0b;font-weight:600;margin-top:2px">⚠️ ${escapeHtml(fireWarningText(d.warning))}</div>`
    : ''
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
    <div style="display:flex;align-items:center;gap:6px"><strong>#${d.rank} ${d.name}</strong>${linkIcon}</div>
    ${fire}
    ${d.elevationFt != null ? `<div>Elevation: ${Number(d.elevationFt).toLocaleString()} ft</div>` : ''}
    <div>Precip total: <strong>${Number(d.precipTotalIn).toFixed(3)}"</strong></div>
    <div>Wind avg: ${Number(d.windAvgMph).toFixed(1)} mph · Temp avg: ${Number(d.tempAvgF).toFixed(1)}°F</div>
    ${d.aqiAvg != null ? `<div>PM2.5 AQI avg: <strong>${d.aqiAvg}</strong> · max: ${d.aqiMax}</div>` : ''}
    <div>Coordinates: ${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}</div>
  </div>`
}

// NIFC incident names reach setHTML through the warning line — escape them.
// Mirrors the private helper in wildfires.ts (kept local to keep this change
// self-contained rather than reworking that module's untested export surface).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
