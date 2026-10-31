import { DestinationResult, SortBy } from '../types'
import { type PendingDestination } from './customList'
import { caltopoUrl } from './caltopoUrl'
import { destinationLinkLabel, destinationUrl } from './destinationUrl'
import { FireWarning, firePopupText } from './fireProximity'
import { type ClosureWarning, closurePopupText } from './closureProximity'
import {
  escapeHtml,
  factsRow,
  metaBand,
  metricGrid,
  popupButton,
  popupCard,
  warningLine,
} from './popup/popupChrome'
import { type GroundState, slopeFact } from './popup/groundFact'
import { POI_ACTION_ATTR } from './poiPopup'
import { pendingLinkRow } from './results/resultsCells'
import { placeType } from './geocode'
import { ColDef, TYPE_COL } from './tableColumns'
import { elevationFact, popupGrid, popupGroups, popupIdentity } from './popup/popupRows'
import type { UsStates } from './usStates'
import { FIRE_LINK_ZOOM, nifcFireUrl } from './wildfires'

// The attribute the map handler finds a card's remove button by. Its own
// rather than the clicked feature's, because the two buttons do different
// things: this one records a removal from the report, the way the row's × does,
// where that one unregisters a place the session added.
export const RESULT_ACTION_ATTR = 'data-result-action'

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
  // Whether the window is one hour, which the ranked family's colours read
  // the way the table's do. Optional for the reason `modelId` is.
  pointSample?: boolean
  // Whether the grid takes its narrow insets, for a map too narrow for the
  // widest grid at full inset (`compactGrid`).
  compact?: boolean
  // Each grid column's width once a reader dragged its head's edge, which
  // every result card shares (TJ 2026-10-30).
  widths?: Readonly<Record<string, number>>
  // The map's zoom when the card is drawn, which the coordinates' CalTopo link
  // carries so the reader lands on the view they were looking at (#712).
  // Optional for a card built with no map under it, which links without one.
  mapZoom?: number
  // Whether the card carries `Remove from analysis`, which does what the
  // row's × does (#696). It is how a finger removes a row: a phone's row tap
  // opens this card, where the × beside the rank shows only on hover.
  removable?: boolean
  // The state outlines a crag's search names its state by, when held.
  usStates?: UsStates | null
  // The ground under the marker, as far as its read has got (#832); none
  // where the card reads no ground.
  ground?: GroundState
}): string {
  const r = d.row
  const url = destinationUrl(
    {
      name: r.name,
      type: r.type,
      latitude: r.latitude,
      longitude: r.longitude,
      osm_id: r.osm_id ?? null,
    },
    d.usStates ?? null,
  )
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
    factsRow(
      identity.type,
      identity.elevation,
      r.latitude,
      r.longitude,
      caltopoUrl(r.latitude, r.longitude, d.mapZoom),
      slopeFact(d.ground),
    ),
  ])

  // The measurements as one grid, a row per family and a column per aggregate
  // (TJ, 2026-10-08). The two safety lines stand in a section of their own
  // above it (`popupCard`'s `warnings`).
  const grid = popupGrid(
    popupGroups(r, d.columns, { modelId: d.modelId, times: d.times, rankedBy: d.rankedBy, pointSample: d.pointSample }),
  )
  const body = grid.rows.length ? metricGrid(grid, { compact: d.compact, widths: d.widths }) : ''

  const title = `${d.rank ? `#${escapeHtml(String(d.rank))} ` : ''}${escapeHtml(r.name)}`
  // The clicked feature's remove, in its words and its look (#712), so the
  // one destination says "out" the same way before and after an analysis.
  const action = d.removable ? popupButton(`${RESULT_ACTION_ATTR}="remove"`, 'Remove from analysis') : ''
  return popupCard({ title, link: { href: url, label: destinationLinkLabel(r.type) }, meta, warnings: [fire, closure].filter(Boolean), body, action })
}

/**
 * The card a pending dot opens (#832, TJ 2026-10-31): a destination the
 * analysis has not forecast yet, a pasted or searched point or one a ring's
 * search found. A ranked card's header with no rank and no grid, because
 * nothing on it is a forecast yet: its name, its link out, its coordinates,
 * and its type, elevation and slope where it has them.
 *
 * It carries `Remove from analysis` exactly where the table's pending row
 * carries its ×, on a searched place alone (TJ, 2026-10-31): a pasted row
 * leaves by editing the coordinates box and a found one by the ring that
 * found it (`customList.ts`). The button is the clicked label's, since what
 * it does is the label's: it unregisters a place the session added.
 */
export function pendingPopupHtml(d: {
  pending: PendingDestination
  mapZoom?: number
  usStates?: UsStates | null
  ground?: GroundState
}): string {
  const p = d.pending
  const link = pendingLinkRow(p)
  // The type in the word the Type column will use once the destination ranks:
  // a found row's kind is its row type already, and a searched place's is
  // `placeType`'s. A pasted coordinate has none, and `custom` is no word a
  // reader would use for it.
  const rowType = p.source === 'polygon' ? (p.kind ?? 'custom') : placeType(p.kind ?? '')
  const type = rowType === 'custom' ? null : String(TYPE_COL.format!(rowType))
  const meta = metaBand([
    factsRow(
      type,
      p.elevation_ft != null ? elevationFact(p.elevation_ft) : null,
      p.latitude,
      p.longitude,
      caltopoUrl(p.latitude, p.longitude, d.mapZoom),
      slopeFact(d.ground),
    ),
  ])
  const action = p.source === 'search' ? popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis') : ''
  return popupCard({
    title: escapeHtml(p.name),
    link: { href: destinationUrl(link, d.usStates ?? null), label: destinationLinkLabel(link.type) },
    meta,
    action,
  })
}
