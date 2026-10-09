/**
 * The clickable basemap peaks and lakes: the popup a click opens, the button
 * in it that adds the place as a destination or takes it back out, and the
 * glow that lights them all while the panel points at them.
 *
 * The map already draws these features from the OpenMapTiles source, so the
 * click costs no lookup: the name and elevation are in the feature's own
 * properties. Adding one registers it exactly as a search by name does, which
 * is why this needs no pipeline of its own: it lands in the same list, the same
 * URL param, and the same `custom_destinations` on the next Analyze.
 *
 * The layers themselves are the basemap's (`enhanceBasemap` adds them), so this
 * module adds none. It registers them as a click target (`map/mapPopups.ts`).
 */
import type * as maplibregl from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { Point } from 'geojson'
import {
  BasemapPoi,
  LAKE_LAYERS,
  POI_LAYERS,
  poiFromFeature,
  poiToPlace,
  samePoi,
} from '../utils/basemapPoi'
import { POI_ACTION_ATTR, poiPopupHtml } from '../utils/poiPopup'
import { lakeAnchor } from './basemap'
import type { MapController } from './controller'
import type { MapPopups } from './mapPopups'

export interface PoiPopups {
  /** Light every clickable peak and lake, or put them back. */
  setPointed(pointed: boolean): void
}

export function mountPoiPopups(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: MapPopups
  },
): PoiPopups {
  const { controller, popups } = deps

  function openPoiPopup(poi: BasemapPoi) {
    const popup = popups.create([poi.lon, poi.lat], '', { owner: 'poi' })

    // Which registered place this POI is, or null. Held in the closure
    // rather than re-read from the controller after each click: that
    // only catches up on React's next render, and the button has to
    // flip on the click that caused it.
    let registered = controller.inputs.searchedPlaces.find((p) => samePoi(poi, p)) ?? null

    function render() {
      popup.setHTML(poiPopupHtml(poi, registered !== null))
      // setHTML replaces the content element's children, so the button is
      // a new node every time and its listener has to be re-armed. The
      // timeout lets MapLibre attach the markup first, matching the
      // remove-point popup in `map/drawRing.ts`.
      setTimeout(() => {
        popup
          .getElement()
          ?.querySelector<HTMLButtonElement>(`[${POI_ACTION_ATTR}]`)
          ?.addEventListener('click', () => {
            if (registered) {
              controller.inputs.onRemovePoi(registered.lat, registered.lon)
              registered = null
            } else {
              const place = poiToPlace(poi)
              controller.inputs.onAddPoi(place)
              registered = place
            }
            render()
          })
      }, 0)
    }
    render()
  }

  // A peak or lake under a ranked marker, a draw handle or anything else
  // that outranks it is the rank's call (`utils/mapClick.ts`), and in draw
  // mode these are scenery a polygon corner can land on.
  popups.register({
    target: 'poi',
    layers: POI_LAYERS,
    // A label that names no place (no name, or no usable position) has
    // nothing to add, so the click falls to whatever lies under it.
    open: ({ feature, lngLat, point }) => {
      if (!feature.properties) return false
      const layer = feature.layer.id
      // A peak labels its own summit. A lake's label geometry is a tile
      // artifact — a point for a compact one, a line for a long one — so it
      // is resolved against the water itself; the click point is the
      // fallback, and it is on the lake because that is what was clicked.
      const clicked: [number, number] = [lngLat.lng, lngLat.lat]
      const anchor =
        (LAKE_LAYERS as readonly string[]).includes(layer)
          ? lakeAnchor(map, point, clicked)
          : feature.geometry.type === 'Point'
            ? ((feature.geometry as Point).coordinates as [number, number])
            : clicked
      const poi = poiFromFeature(layer, feature.properties, anchor)
      if (!poi) return false
      openPoiPopup(poi)
    },
  })

  return {
    setPointed(pointed) {
      for (const id of POI_LAYERS) {
        const glow = `${id}-glow`
        if (map.getLayer(glow)) {
          map.setLayoutProperty(glow, 'visibility', pointed ? 'visible' : 'none')
        }
      }
    },
  }
}
