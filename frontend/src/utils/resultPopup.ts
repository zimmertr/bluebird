import { DestinationResult } from '../types'
import { SEP } from '../metrics'
import { destinationUrl } from './destinationUrl'
import { FireWarning, fireWarningText } from './fireProximity'
import {
  coordinateRow,
  escapeHtml,
  groupBlock,
  groupValue,
  metaBand,
  popupLink,
  popupShell,
  row,
} from './popupChrome'
import { ColDef } from './tableColumns'
import { popupGroups, popupIdentity } from './popupRows'
import { FIRE_LINK_ZOOM, nifcFireUrl } from './wildfires'

// Popup body shared by a marker click and a table-rank click (focusResult), so
// the two never drift. The chrome around it — title, link, rule, row shape —
// is popupChrome, shared with the popup a clicked basemap feature opens.
//
// Every value on the card comes from the COLUMNS the results table is showing
// (#370), not from a list spelled here. Before that the popup held six
// hard-coded rows: a Current lookup read "total", "avg", "min" and "max" over
// four copies of one number, because a one-hour window makes every aggregate
// the same value, and a date-range report showed six of the sixteen numbers
// the table had. `popupRows.ts` owns the derivation and is where its rules are
// documented; this file is the markup.
export function resultPopupHtml(d: {
  rank: number | string
  // The row itself, rather than the handful of scalars this used to take. The
  // map already has it: `MapView` matches a clicked feature to its row on the
  // exact coordinates the feature carries, and `results-circles` is the only
  // layer that opens this popup.
  row: DestinationResult
  // The results table's own resolved columns, carrying the point-sample
  // collapse, the ranked family, the Columns picker and the reader's order.
  columns: readonly ColDef[]
  // Nearest active wildfire within the warn radius, or null. Mirrors the warning
  // the results table shows so a point clicked on the map surfaces the same alert.
  warning: FireWarning | null
  // What the Windy links carry: the model the numbers came from, and the
  // report's hourly grid, which is what turns a row's series into the HOUR
  // behind a floor or a ceiling. Both optional so a popup built before an
  // analysis still renders.
  modelId?: string | null
  times?: readonly number[]
  // The model name a row falls back to while one model answered every row. A
  // comparison puts the name on the row itself.
  modelFallbackLabel?: string | null
}): string {
  const r = d.row
  const url = destinationUrl({
    type: r.type,
    latitude: r.latitude,
    longitude: r.longitude,
    osm_id: r.osm_id ?? null,
  })
  // Fire-proximity alert, matching the table's. The incident name inside the
  // text is third-party NIFC data rendered via setHTML, so it is escaped.
  //
  // It stays a banner rather than becoming a line among the metrics, and the
  // Wildfire column is the one the popup does not mirror (TJ, 2026-09-14): it
  // is a safety flag rather than a measurement, and a card that said it twice
  // would be worse at saying it once.
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

  // What the destination IS, above the rule. The type and the model share one
  // line because each is a word rather than a measurement, and the separator
  // is the one metrics.ts already uses to part two facts on a line.
  const identity = popupIdentity(r, d.columns, d.modelFallbackLabel)
  const named = [identity.type, identity.model].filter(Boolean)
  const meta = metaBand([
    named.length ? `<div>${escapeHtml(named.join(` ${SEP} `))}</div>` : '',
    coordinateRow(r.latitude, r.longitude),
  ])

  const groups = popupGroups(r, d.columns, { modelId: d.modelId, times: d.times })
  const body = [
    fire,
    ...groups.map((g, at) =>
      // One value reads as a plain "label: value" line, which is every group
      // over a Current lookup and the elevation over any report. Two or more
      // take the heading-and-values shape.
      g.single
        ? row(g.label, g.values[0].text, g.values[0].href)
        : groupBlock(
            g.label,
            g.values.map((v) => groupValue(v.aggregate, v.text, v.href)),
            at === 0 && !d.warning,
          ),
    ),
  ]
    .filter(Boolean)
    .join('\n    ')

  const title = `${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(r.name)}`
  return popupShell(title, url, body, meta)
}
