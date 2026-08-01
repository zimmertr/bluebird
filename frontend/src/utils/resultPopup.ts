import { DestinationResult } from '../types'
import { AGGREGATE, NOUN } from '../metrics'
import { destinationUrl } from './destinationUrl'
import { FireWarning, fireWarningText } from './fireProximity'

// The popup reads as prose rather than as table headers, so it lowercases the
// aggregate and skips metrics.ts's separator.
const TOTAL = AGGREGATE.total.toLowerCase()
const AVERAGE = AGGREGATE.average.toLowerCase()
const MAXIMUM = AGGREGATE.maximum.toLowerCase()

/**
 * The face a value is set in, so the label and the number separate at a glance
 * rather than on a re-read.
 *
 * Weight is not available for this: the popup's one <strong> is its title, and
 * a second bold would stop the title being the emphasis. A face change carries
 * the same separation without spending any. Monospace specifically, because
 * that is what the results table already does — every metric cell is mono there
 * and only the name is sans — so the same numbers look the same in both places,
 * and a column of them lines up on the decimal.
 *
 * The stack is spelled out rather than left to a bare `monospace` keyword
 * because this markup is handed to MapLibre's setHTML, which the
 * stylesheet-scanned design system in styles.ts cannot reach.
 */
const VALUE_FACE = 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

/**
 * One "label: value" line.
 *
 * Every stat gets its own. Wind and temperature used to share a line separated
 * by a "·" — the only line carrying two metrics, and the only one long enough
 * to wrap, so on a narrow map it broke at whatever character reached the edge
 * and the second label landed mid-line under the first one's number. The
 * remaining "·" between the two air-quality figures went the same way.
 */
function row(label: string, value: string): string {
  return `<div>${label}: <span style="${VALUE_FACE}">${value}</span></div>`
}

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
  // The name is OSM's, which makes it third-party text on its way to setHTML
  // exactly like the incident name below it. It had gone unescaped since the
  // popup was written, so the escaping is not new policy here, just applied to
  // the one string in this file that was missing it.
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
    <div style="display:flex;align-items:center;gap:6px"><strong>${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(d.name)}</strong>${linkIcon}</div>
    ${fire}
    ${d.elevationFt != null ? row('Elevation', `${Number(d.elevationFt).toLocaleString()} ft`) : ''}
    ${row(`${NOUN.precip} ${TOTAL}`, `${Number(d.precipTotalIn).toFixed(3)}"`)}
    ${row(`${NOUN.wind} ${AVERAGE}`, `${Number(d.windAvgMph).toFixed(1)} mph`)}
    ${row(`${NOUN.temp} ${AVERAGE}`, `${Number(d.tempAvgF).toFixed(1)}°F`)}
    ${d.aqiAvg != null ? row(`${NOUN.aqi} ${AVERAGE}`, String(d.aqiAvg)) : ''}
    ${d.aqiAvg != null ? row(`${NOUN.aqi} ${MAXIMUM}`, String(d.aqiMax)) : ''}
    ${row('Coordinates', `${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}`)}
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
