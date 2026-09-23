/**
 * The clickable basemap peaks and lakes: the popup a click opens, the button
 * in it that adds the place as a destination or takes it back out, the cursor
 * over one, and the glow that lights them all while the panel points at them.
 *
 * The map already draws these features from the OpenMapTiles source, so the
 * click costs no lookup: the name and elevation are in the feature's own
 * properties. Adding one registers it exactly as a search by name does, which
 * is why this needs no pipeline of its own: it lands in the same list, the same
 * URL param, and the same `custom_destinations` on the next Analyze.
 *
 * The layers themselves are the basemap's (`enhanceBasemap` adds them), so this
 * module adds none. It only listens on them.
 */
import { Popup } from 'maplibre-gl'
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
import { WILDFIRE_FILL_LAYER } from './overlays/wildfires'
import { isPinning, popupOptions, type PopupBoard } from './popups'
import { RESULT_MARKER_LAYER } from './resultsLayer'

export interface PoiPopups {
  /** Light every clickable peak and lake, or put them back. */
  setPointed(pointed: boolean): void
}

export function mountPoiPopups(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: PopupBoard
    restCursor: () => void
  },
): PoiPopups {
  const { controller, popups, restCursor } = deps

  function openPoiPopup(poi: BasemapPoi, pinned: boolean) {
    if (!pinned) popups.closeAll()
    const popup = new Popup({ ...popupOptions(map), closeOnClick: false })
      .setLngLat([poi.lon, poi.lat])
      .addTo(map)
    popups.track(popup)

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

  for (const layer of POI_LAYERS) {
    map.on('click', layer, (e) => {
      // While drawing, these features are scenery: the click belongs to
      // the ring. The general click (`utils/mapClick.ts`) reads them the
      // same way while drawing, so a polygon corner can land on a peak
      // label.
      if (controller.inputs.drawing) return
      // A basemap peak that has since been analyzed has a result marker
      // sitting on top of it, and both layers answer the same click —
      // which stacked two popups on one summit. The marker wins: it is
      // the newer, more specific thing, and its popup carries the
      // forecast this one could only offer to fetch. A fire perimeter
      // wins for the same reason, having already opened a tab.
      const claimed = map.queryRenderedFeatures(e.point, {
        layers: [RESULT_MARKER_LAYER, WILDFIRE_FILL_LAYER],
      })
      if (claimed.length > 0) return
      const f = e.features?.[0]
      if (!f?.properties) return
      // A peak labels its own summit. A lake's label geometry is a tile
      // artifact — a point for a compact one, a line for a long one — so
      // it is resolved against the water itself; the click point is the
      // fallback, and it is on the lake because that is what was clicked.
      const clicked: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      const anchor =
        (LAKE_LAYERS as readonly string[]).includes(layer)
          ? lakeAnchor(map, e.point, clicked)
          : f.geometry.type === 'Point'
            ? ((f.geometry as Point).coordinates as [number, number])
            : clicked
      const poi = poiFromFeature(layer, f.properties, anchor)
      if (poi) openPoiPopup(poi, isPinning(e))
    })
    map.on('mouseenter', layer, () => {
      if (!controller.inputs.drawing) map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layer, restCursor)
  }

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
