import { DestinationResult } from '../types'
import { AGGREGATE, NOUN } from '../metrics'
import { destinationUrl } from './destinationUrl'
import { FireWarning, fireWarningText } from './fireProximity'
import { coordinateRow, escapeHtml, popupShell, row } from './popupChrome'

// The popup reads as prose rather than as table headers, so it lowercases the
// aggregate and skips metrics.ts's separator.
const TOTAL = AGGREGATE.total.toLowerCase()
const AVERAGE = AGGREGATE.average.toLowerCase()
const MAXIMUM = AGGREGATE.maximum.toLowerCase()

// Popup body shared by a marker click and a table-rank click (focusResult), so
// the two never drift. Values arrive raw; all formatting lives here. The chrome
// around it — title, link, rule, row shape — is popupChrome, shared with the
// popup a clicked basemap feature opens.
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
  // Nearest active wildfire within the warn radius, or null. Mirrors the warning
  // the results table shows so a point clicked on the map surfaces the same alert.
  warning: FireWarning | null
}): string {
  const url = destinationUrl({
    type: d.type,
    latitude: d.latitude,
    longitude: d.longitude,
    osm_id: d.osmId,
  })
  // Fire-proximity alert, matching the table's. The incident name inside the
  // text is third-party NIFC data rendered via setHTML, so it is escaped.
  const fire = d.warning
    ? `<div style="color:#f59e0b;font-weight:600;margin-bottom:2px">⚠️ ${escapeHtml(fireWarningText(d.warning))}</div>`
    : ''
  const title = `${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(d.name)}`

  const body = [
    fire,
    d.elevationFt != null ? row('Elevation', `${Number(d.elevationFt).toLocaleString()} ft`) : '',
    row(`${NOUN.precip} ${TOTAL}`, `${Number(d.precipTotalIn).toFixed(3)}"`),
    row(`${NOUN.wind} ${AVERAGE}`, `${Number(d.windAvgMph).toFixed(1)} mph`),
    row(`${NOUN.temp} ${AVERAGE}`, `${Number(d.tempAvgF).toFixed(1)}°F`),
    d.aqiAvg != null ? row(`${NOUN.aqi} ${AVERAGE}`, String(d.aqiAvg)) : '',
    d.aqiAvg != null ? row(`${NOUN.aqi} ${MAXIMUM}`, String(d.aqiMax)) : '',
    coordinateRow(d.latitude, d.longitude),
  ]
    .filter(Boolean)
    .join('\n    ')

  return popupShell(title, url, body)
}
