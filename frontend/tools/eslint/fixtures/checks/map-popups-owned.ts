// Must trip: a popup of its own, and a layer listening for a click and a hover.
import { Popup } from 'maplibre-gl'
export function mountProbe(map: any) {
  const popup = new Popup({ closeButton: false })
  map.on('click', 'probe-layer', () => popup.addTo(map))
  map.on('mouseenter', 'probe-layer', () => {})
  // A drag's mousedown moves a handle, and a popup's own close is its own.
  map.on('mousedown', 'probe-layer', () => {})
  popup.on('close', () => {})
}
