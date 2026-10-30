/**
 * The card a right-click or a long press opens anywhere on the map (#832),
 * and its button, which adds the spot as a destination or takes it back out.
 *
 * The gesture is `map/mapPopups.ts`'s, as every listener on the map is; this
 * module says what it opens. Adding the spot registers it the way a pasted
 * coordinate does, so it needs no pipeline of its own: the same list, the same
 * URL param, and the same `custom_destinations` on the next Analyze.
 */
import type * as maplibregl from 'maplibre-gl'
import { coordinatePlace, coordinatePopupHtml, isCoordinatePlace } from '../utils/coordinatePopup'
import { POI_ACTION_ATTR } from '../utils/poiPopup'
import type { MapController } from './controller'
import type { MapPopups } from './mapPopups'

export function mountCoordinatePopups(
  map: maplibregl.Map,
  deps: { controller: MapController; popups: MapPopups },
): void {
  const { controller, popups } = deps

  popups.registerContextMenu(({ lng, lat }) => {
    const place = coordinatePlace(lat, lng)
    // Held in the closure rather than re-read from the controller after each
    // press, as the label's card does (`map/poiPopup.ts`): the controller
    // catches up on React's next render, and the button flips on this one.
    let added = controller.inputs.searchedPlaces.some((p) => isCoordinatePlace(p, place))
    const html = () => coordinatePopupHtml(place, added, map.getZoom())
    const { popup } = popups.openCard([place.lon, place.lat], html(), { result: true })

    // setHTML makes the button a new node, so its listener is armed again
    // after every redraw, once MapLibre has attached the markup.
    function arm() {
      setTimeout(() => {
        popup
          .getElement()
          ?.querySelector<HTMLButtonElement>(`[${POI_ACTION_ATTR}]`)
          ?.addEventListener('click', () => {
            if (added) controller.inputs.onRemovePoi(place.lat, place.lon)
            else controller.inputs.onAddPoi(place)
            added = !added
            popup.setHTML(html())
            arm()
          })
      }, 0)
    }
    arm()
  })
}
