// Must trip: a popup and a DOM marker of their own, a layer listening for a
// click, a hover and a touch, an event the linter cannot read, and a listener
// on the map's canvas.
import { Marker, Popup } from 'maplibre-gl'
const EVENT = 'click'
export function mountProbe(map: any) {
  const popup = new Popup({ closeButton: false })
  new Marker().addTo(map)
  map.on('click', 'probe-layer', () => popup.addTo(map))
  map.on('mouseenter', 'probe-layer', () => {})
  map.on('touchend', 'probe-layer', () => {})
  map.on(EVENT, () => {})
  map.getCanvas().addEventListener('pointerdown', () => {})
  // A popup's own close and a camera event are their own.
  popup.on('close', () => {})
  map.on('moveend', () => {})
}
