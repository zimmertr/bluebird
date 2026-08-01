import { BasemapPoi } from './basemapPoi'

// The popup a clicked basemap peak or lake opens (#119). Kept in utils beside
// resultPopupHtml and wildfirePopupHtml for the same reason: this markup is
// handed to MapLibre's setHTML, so the design system in styles.ts cannot reach
// it, and keeping it out of the component is what makes it unit-testable
// without pulling maplibre-gl into a node test.
//
// It deliberately shows no forecast. Nothing has been fetched for this point
// yet — that is what adding it and running Analyze is for — and a popup that
// looked like a result popup with empty metrics would read as a failed lookup
// rather than an un-run one.

// The attribute the map handler looks for to wire the button back to React.
// One attribute for both states, with the action in its value, so the handler
// reads the intent off the element instead of inferring it from which selector
// matched.
export const POI_ACTION_ATTR = 'data-poi-action'

const BUTTON_BASE =
  'border:none;padding:5px 12px;border-radius:4px;cursor:pointer;font-size:12px;font-family:sans-serif;font-weight:600;margin-top:6px'

/**
 * @param added Whether this POI is already a destination, which flips the
 * button from adding to removing. Clicking a peak you have already added is a
 * question about that peak, and the honest answer to it is the way back out.
 */
export function poiPopupHtml(poi: BasemapPoi, added: boolean): string {
  const action = added
    ? `<button ${POI_ACTION_ATTR}="remove" style="${BUTTON_BASE};background:#334155;color:#e2e8f0">Remove from analysis</button>`
    : `<button ${POI_ACTION_ATTR}="add" style="${BUTTON_BASE};background:#0284c7;color:#fff">Add to analysis</button>`

  // Name and kind are OSM's, so they are third-party text on their way to
  // setHTML — escaped exactly like the incident name in the wildfire popup.
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
    <div><strong>${escapeHtml(poi.name)}</strong></div>
    <div style="color:#475569;font-size:11px;text-transform:capitalize">${escapeHtml(poi.kind)}</div>
    ${poi.elevationFt !== undefined ? `<div>Elevation: ${poi.elevationFt.toLocaleString()} ft</div>` : ''}
    ${action}
  </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
