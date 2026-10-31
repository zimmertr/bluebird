/**
 * The card a right-click or a long press opens anywhere on the map (#832):
 * the ground under the spot, and a button that adds the spot as a destination
 * or takes it back out.
 *
 * The gesture is `map/mapPopups.ts`'s, as every listener on the map is; this
 * module says what it opens. Adding the spot registers it the way a pasted
 * coordinate does, so it needs no pipeline of its own: the same list, the same
 * URL param, and the same `custom_destinations` on the next Analyze, which is
 * how the spot gets its forecast (TJ, 2026-10-31).
 *
 * The card opens at once and fills in its ground when the read lands
 * (`groundReadings.ts`).
 */
import type * as maplibregl from 'maplibre-gl'
import type { Popup } from 'maplibre-gl'
import { coordinatePlace, coordinatePopupHtml, isCoordinatePlace } from '../utils/coordinatePopup'
import { POI_ACTION_ATTR } from '../utils/poiPopup'
import type { MapController } from './controller'
import type { GroundReadings } from './groundReadings'
import type { MapPopups } from './mapPopups'

/** One open card. */
interface Card {
  popup: Popup
  place: ReturnType<typeof coordinatePlace>
  added: boolean
  html: string
}

export function mountCoordinatePopups(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: MapPopups
    // The ground under the spot; with none, the card reads no ground.
    ground?: GroundReadings
  },
): void {
  const { controller, popups, ground } = deps
  let cards: Card[] = []

  const htmlOf = (card: Card) =>
    coordinatePopupHtml(card.place, card.added, {
      mapZoom: map.getZoom(),
      ground: ground?.at(card.place.lat, card.place.lon),
    })

  // setHTML makes the button a new node, so it is armed again after every
  // write, once MapLibre has attached the markup.
  function arm(card: Card) {
    setTimeout(() => {
      card.popup
        .getElement()
        ?.querySelector<HTMLButtonElement>(`[${POI_ACTION_ATTR}]`)
        ?.addEventListener('click', () => {
          if (card.added) controller.inputs.onRemovePoi(card.place.lat, card.place.lon)
          else controller.inputs.onAddPoi(card.place)
          card.added = !card.added
          draw(card)
        })
    }, 0)
  }

  // The card's markup as it stands, written only when it changed, and
  // leaving focus where it is: a redraw answers a read, not a press.
  function draw(card: Card) {
    if (!cards.includes(card)) return
    const html = htmlOf(card)
    if (html === card.html) return
    const focus = card.popup.options?.focusAfterOpen
    if (card.popup.options) card.popup.options.focusAfterOpen = false
    card.popup.setHTML(html)
    if (card.popup.options) card.popup.options.focusAfterOpen = focus
    card.html = html
    arm(card)
  }

  popups.registerContextMenu(({ lng, lat }) => {
    const place = coordinatePlace(lat, lng)
    const card: Card = {
      popup: null as unknown as Popup,
      place,
      // Held on the card rather than re-read from the controller after each
      // press, as the label's card does (`map/poiPopup.ts`): the controller
      // catches up on React's next render, and the button flips on this one.
      added: controller.inputs.searchedPlaces.some((p) => isCoordinatePlace(p, place)),
      html: '',
    }
    card.html = htmlOf(card)
    const { popup } = popups.openCard([place.lon, place.lat], card.html, { result: true })
    card.popup = popup
    cards.push(card)
    const release = ground?.hold()
    popup.on('close', () => {
      cards = cards.filter((c) => c !== card)
      release?.()
    })
    arm(card)
  })

  ground?.onRead(() => {
    for (const card of cards) draw(card)
  })
}
