import { BasemapPoi, LAKE_CLASS } from './basemapPoi'
import { destinationUrl } from './destinationUrl'
import { isPeakKind } from './geocode'
import { coordinateRow, escapeHtml, popupShell, row } from './popupChrome'

// The popup a clicked basemap peak or lake opens (#119).
//
// It wears the same chrome a ranked result does — title, link out, rule, rows —
// because a destination you clicked and the same destination once analyzed are
// one object at two stages, and they were reading as two kinds of card. What it
// does not show is a forecast: nothing has been fetched for this point yet,
// that is what adding it and running Analyze is for, and a result popup with
// empty metrics would read as a failed lookup rather than an un-run one.

// The attribute the map handler looks for to wire the button back to React.
// One attribute for both states, with the action in its value, so the handler
// reads the intent off the element instead of inferring it from which selector
// matched.
export const POI_ACTION_ATTR = 'data-poi-action'

const BUTTON_BASE =
  'border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-family:sans-serif;font-weight:600;margin-top:6px'

/**
 * Where a clicked feature links out to.
 *
 * A tile carries no OSM id, so this cannot deep-link to the object the way an
 * analyzed row does. `destinationUrl` already handles that: a peak goes to
 * Peakbagger's coordinate search either way, and everything else falls back to
 * an OSM pin at the point — which is exactly what a custom row gets, and for
 * the same reason.
 */
function poiUrl(poi: BasemapPoi): string {
  return destinationUrl({
    type: isPeakKind(poi.kind) ? 'peak' : poi.kind === LAKE_CLASS ? 'lake' : 'custom',
    latitude: poi.lat,
    longitude: poi.lon,
    osm_id: null,
  })
}

/**
 * @param added Whether this POI is already a destination, which flips the
 * button from adding to removing. Clicking a peak you have already added is a
 * question about that peak, and the honest answer to it is the way back out.
 */
export function poiPopupHtml(poi: BasemapPoi, added: boolean): string {
  const action = added
    ? `<button ${POI_ACTION_ATTR}="remove" style="${BUTTON_BASE};background:#334155;color:#e2e8f0">Remove from analysis</button>`
    : `<button ${POI_ACTION_ATTR}="add" style="${BUTTON_BASE};background:#0284c7;color:#fff">Add to analysis</button>`

  // The kind used to have a line of its own under the title. It said "Peak"
  // beneath the name of a peak, which the icon on the map had already said and
  // the name usually says again.
  const body = [
    poi.elevationFt !== undefined
      ? row('Elevation', `${poi.elevationFt.toLocaleString()} ft`)
      : '',
    coordinateRow(poi.lat, poi.lon),
    action,
  ].join('\n    ')

  // The name is OSM's, so it is third-party text on its way to setHTML.
  return popupShell(escapeHtml(poi.name), poiUrl(poi), body)
}
