import { DestinationResult, SortBy } from '../types'
import { destinationUrl } from './destinationUrl'
import { FireWarning, firePopupText } from './fireProximity'
import { type ClosureWarning, closurePopupText } from './closureProximity'
import {
  escapeHtml,
  factsRow,
  metaBand,
  metricGrid,
  popupShell,
  warningLine,
} from './popupChrome'
import { ColDef } from './tableColumns'
import { popupGrid, popupGroups, popupIdentity } from './popupRows'
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
  // The active area closure the destination stands inside, or null (#550).
  // Mirrors the table's Closure column the way `warning` mirrors its wildfire
  // column. Optional so a caller with no closure check still builds a card.
  closure?: ClosureWarning | null
  // What the Windy links carry: the model the numbers came from, and the
  // report's hourly grid, which is what turns a row's series into the HOUR
  // behind a floor or a ceiling. Both optional so a popup built before an
  // analysis still renders.
  modelId?: string | null
  times?: readonly number[]
  // The model name a row falls back to while one model answered every row. A
  // comparison puts the name on the row itself.
  modelFallbackLabel?: string | null
  // The key the report ranks by, whose number the grid marks. Optional for
  // the reason `modelId` is.
  rankedBy?: SortBy | null
  // Whether the grid takes its narrow insets, for a map too narrow for the
  // widest grid at full inset (`compactGrid`).
  compact?: boolean
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
  // is this — is what NIFC's map answers (TJ, 2026-09-14).
  const fire = d.warning
    ? warningLine(
        escapeHtml(firePopupText(d.warning)),
        nifcFireUrl(d.warning.longitude, d.warning.latitude, FIRE_LINK_ZOOM),
      )
    : ''
  // The closure line, after the fire line and in its markup: one statement
  // about one order, linked to the order's own page when the Forest Service
  // gave it one, and plain amber text when it did not. The order's name is
  // Forest Service free text rendered via setHTML, so it is escaped.
  const closure = d.closure ? warningLine(escapeHtml(closurePopupText(d.closure)), d.closure.url ?? null) : ''

  // What the destination IS, above the rule: its type, elevation and
  // coordinates on one line (TJ, 2026-10-08). The model a comparison names
  // takes a line of its own above them, because a model's name can be as long
  // as the rest of the line together.
  const identity = popupIdentity(r, d.columns, d.modelFallbackLabel)
  const meta = metaBand([
    identity.model ? `<div>${escapeHtml(identity.model)}</div>` : '',
    factsRow(identity.type, identity.elevation, r.latitude, r.longitude),
  ])

  // The measurements as one grid, a row per family and a column per aggregate
  // (TJ, 2026-10-08). The two safety lines stand in a section of their own
  // above it (`popupShell`'s `warnings`).
  const grid = popupGrid(
    popupGroups(r, d.columns, { modelId: d.modelId, times: d.times, rankedBy: d.rankedBy }),
  )
  const body = grid.rows.length ? metricGrid(grid, { compact: d.compact }) : ''

  const title = `${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(r.name)}`
  return popupShell(title, url, body, meta, { resultCard: true, warnings: [fire, closure].filter(Boolean) })
}
