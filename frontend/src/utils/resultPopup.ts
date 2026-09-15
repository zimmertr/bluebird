import { DestinationResult, HourlySeries } from '../types'
import { AGGREGATE, NOUN, SEP, UNIT, windDatum } from '../metrics'
import { WindowSource } from './forecastWindow'
import { destinationUrl } from './destinationUrl'
import { FireWarning, fireWarningText } from './fireProximity'
import { freezeCellText } from './freezingLevel'
import { coordinateRow, escapeHtml, popupLink, popupShell, row } from './popupChrome'
import { FIRE_LINK_ZOOM, nifcFireUrl } from './wildfires'
import { extremeHourMs, windyUrl } from './windy'

// The popup wears the table's separator (TJ, 2026-09-14) but keeps its own
// lower-cased aggregate. It reads as prose — "Wind at elevation · avg:" ahead
// of a value, not a column head — yet it is naming exactly what a header
// names, and spelling that seam two ways across two surfaces was the drift
// metrics.ts exists to stop. The lower case stays because these are sentences
// with a colon, not headings.
const TOTAL = AGGREGATE.total.toLowerCase()
const AVERAGE = AGGREGATE.average.toLowerCase()
const MINIMUM = AGGREGATE.minimum.toLowerCase()
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
  // The window's lowest freezing level, which is the aggregate this family
  // ranks by (DEFAULT_FAMILY_KEY): the question it answers is the overnight
  // refreeze, and the level almost always bottoms out at night.
  freezeMinFt: number | null
  aqiAvg: number | null
  aqiMax: number | null
  longitude: number
  latitude: number
  // Nearest active wildfire within the warn radius, or null. Mirrors the warning
  // the results table shows so a point clicked on the map surfaces the same alert.
  warning: FireWarning | null
  // What the Windy links below carry, mirroring the table's cells: the model
  // the numbers came from, and — for the two rows that name one hour rather
  // than a whole window — the hour that produced them (TJ, 2026-09-14). All
  // three are optional so a popup built before an analysis still renders.
  modelId?: string | null
  series?: HourlySeries | null
  times?: readonly number[]
  // Which endpoint answered the report this marker belongs to, so the wind row
  // names its datum the way the table's column header does (#361). Optional
  // like the three above, and absent means the row reads the bare noun — which
  // is also what a spanning report gets, because neither datum is true of it.
  windowSource?: WindowSource | null
}): string {
  const url = destinationUrl({
    type: d.type,
    latitude: d.latitude,
    longitude: d.longitude,
    osm_id: d.osmId,
  })
  // Fire-proximity alert, matching the table's. The incident name inside the
  // text is third-party NIFC data rendered via setHTML, so it is escaped.
  //
  // The whole warning is the link, not a glyph beside it: the line is already
  // one statement about one fire, and the reader's question about it — where
  // is this — is what NIFC's map answers (TJ, 2026-09-14). It keeps its amber
  // by re-declaring the colour after `popupLink`'s own.
  const fire = d.warning
    ? popupLink(
        nifcFireUrl(d.warning.longitude, d.warning.latitude, FIRE_LINK_ZOOM),
        `<div style="font-weight:600;margin-bottom:2px">⚠️ ${escapeHtml(fireWarningText(d.warning))}</div>`,
        'color:#f59e0b;display:block',
      )
    : ''

  /**
   * Where a metric row links to.
   *
   * The same link the matching table cell carries: the layer for that metric,
   * the model the number came from, and the hour behind a floor or a ceiling.
   * `extremeHourMs` answers null for an average or a total, which is every row
   * here but the freezing-level minimum and the AQI maximum.
   */
  const windy = (layer: string, columnKey: string) =>
    windyUrl({
      latitude: d.latitude,
      longitude: d.longitude,
      layer,
      modelId: d.modelId,
      atMs: extremeHourMs(columnKey, d.series, d.times ?? []),
    })
  // The wind row's noun, with the datum this report's window source implies.
  // Resolved once rather than at the row, which asked metrics.ts the same
  // question twice on one line.
  const datum = windDatum(d.windowSource)
  const windNoun = datum ? `${NOUN.wind} ${datum}` : NOUN.wind

  const title = `${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(d.name)}`

  const body = [
    fire,
    d.elevationFt != null ? row('Elevation', `${Number(d.elevationFt).toLocaleString()} ft`) : '',
    row(`${NOUN.precip} ${SEP} ${TOTAL}`, `${Number(d.precipTotalIn).toFixed(3)}"`, windy('rain', 'precip_total_in')),
    // "Wind at elevation avg", composed rather than spelled: the datum comes
    // from metrics.ts like the noun beside it, and the popup lower-cases the
    // aggregate here the way it does for every other row.
    row(`${windNoun} ${SEP} ${AVERAGE}`, `${Number(d.windAvgMph).toFixed(1)} mph`, windy('wind', 'wind_avg_mph')),
    row(`${NOUN.temp} ${SEP} ${AVERAGE}`, `${Number(d.tempAvgF).toFixed(1)}°F`, windy('temp', 'temp_avg_f')),
    // Always drawn, unlike the two air-quality rows below it. A missing air
    // quality is a gap in one forecast, so the row goes with it; a missing
    // freezing level is the chosen MODEL publishing no such variable, and a
    // row that vanished would look like the app had forgotten the metric.
    // A popup has no hover to explain the mark with, so it carries the same
    // mark the table's cell does and nothing more.
    // The one row that can be drawn with no number behind it, so it is also the
    // one that can carry no link: a mark saying the model publishes no freezing
    // level has nothing for Windy to show.
    row(
      `${NOUN.freeze} ${SEP} ${MINIMUM}`,
      freezeCellText(d.freezeMinFt) ??
        `${Number(d.freezeMinFt).toLocaleString()} ${UNIT.freeze}`,
      d.freezeMinFt != null ? windy('deg0', 'freeze_min_ft') : null,
    ),
    d.aqiAvg != null
      ? row(`${NOUN.aqi} ${SEP} ${AVERAGE}`, String(d.aqiAvg), windy('pm2p5', 'aqi_avg'))
      : '',
    d.aqiAvg != null
      ? row(`${NOUN.aqi} ${SEP} ${MAXIMUM}`, String(d.aqiMax), windy('pm2p5', 'aqi_max'))
      : '',
    coordinateRow(d.latitude, d.longitude),
  ]
    .filter(Boolean)
    .join('\n    ')

  return popupShell(title, url, body)
}
