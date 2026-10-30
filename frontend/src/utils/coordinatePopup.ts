import { caltopoUrl } from './caltopoUrl'
import type { Place } from './geocode'
import { coordinateLabel } from './points'
import { escapeHtml, popupButton, popupCard } from './popup/popupChrome'
import { POI_ACTION_ATTR } from './poiPopup'

// The popup a right-click or a long press opens anywhere on the map (#832):
// a spot no label names, a col, a camp, a point on a ridge. A sibling of the
// clicked label's card (`poiPopup.ts`) rather than a case of it, because what
// it describes is a coordinate and not a feature: there is no name, no kind
// and no page to link to but the map itself.
//
// The coordinate pair is the title, and its link-out glyph opens CalTopo at
// the point rather than a facts line's pair doing so, since the title already
// says what the pair would (TJ, 2026-10-30). No copy button: CalTopo is where
// a reader takes a coordinate next.

// Five decimals, about a metre, the precision the title shows. The point is
// rounded before it becomes a destination so the row, its share link and the
// card all carry the coordinate the reader saw.
const round5 = (v: number) => Math.round(v * 1e5) / 1e5

/** The point a press landed on, as the destination `Add to analysis` registers. */
export function coordinatePlace(lat: number, lon: number): Place {
  const at = { lat: round5(lat), lon: round5(lon) }
  // The kind a pasted coordinate gets in the search box, so the two ways of
  // naming a bare point make one kind of destination.
  return { label: coordinateLabel(at.lat, at.lon), description: '', kind: 'coordinates', ...at }
}

/** Whether a registered place is the point this card describes. */
export function isCoordinatePlace(place: Pick<Place, 'lat' | 'lon'>, point: Pick<Place, 'lat' | 'lon'>): boolean {
  return place.lat === point.lat && place.lon === point.lon
}

/**
 * @param point The rounded point, from `coordinatePlace`.
 * @param added Whether it is already a destination, which flips the button
 * from adding to removing, as on a clicked label's card.
 * @param mapZoom The map's zoom when the card is drawn, which the CalTopo link carries.
 */
export function coordinatePopupHtml(point: Pick<Place, 'lat' | 'lon'>, added: boolean, mapZoom?: number): string {
  const button = added
    ? popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis')
    : popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis')
  return popupCard({
    title: escapeHtml(coordinateLabel(point.lat, point.lon)),
    link: { href: caltopoUrl(point.lat, point.lon, mapZoom), label: 'Open in CalTopo' },
    action: button,
  })
}
