import { FEET_PER_METER } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import type { Place } from './geocode'
import { roundTo } from './numbers'
import { coordinateLabel } from './points'
import { escapeHtml, factValue, factsLine, metaBand, pendingValue, popupButton, popupCard } from './popup/popupChrome'
import { type GroundState, slopeFact } from './popup/groundFact'
import { elevationFact } from './popup/popupRows'
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
//
// Under the title, the ground: its height, and its slope and aspect as one
// fact, `8,412 ft · [swatch] 38° NE` (TJ, 2026-10-30, layout 1 of the
// mockups). The height is the tile's, since a bare point has no other. The
// card carries no forecast: a point is forecast by adding it and pressing
// Analyze, which ranks it beside the field (TJ, 2026-10-31).

// Five decimals, about a metre, the precision the title shows. The point is
// rounded before it becomes a destination so the row, its share link and the
// card all carry the coordinate the reader saw.
const round5 = (v: number) => roundTo(v, 5)

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

/** What the card draws beside its point. */
export interface CoordinateCardView {
  /** The map's zoom when the card is drawn, which the CalTopo link carries. */
  mapZoom?: number
  ground?: GroundState
}

/** The ground as the facts line says it: the height in feet, then the slope (`slopeFact`). */
function groundLine(ground: GroundState): string {
  if (ground.kind === 'none') return ''
  if (ground.kind === 'pending') return factsLine([pendingValue()])
  const feet = Math.round(ground.reading.elevationM * FEET_PER_METER)
  return factsLine([factValue(escapeHtml(elevationFact(feet))), slopeFact(ground)])
}

/**
 * @param point The rounded point, from `coordinatePlace`.
 * @param added Whether it is already a destination, which flips the button
 * from adding to removing, as on a clicked label's card.
 * @param view The ground, as far as its read has got.
 */
export function coordinatePopupHtml(
  point: Pick<Place, 'lat' | 'lon'>,
  added: boolean,
  view: CoordinateCardView = {},
): string {
  const button = added
    ? popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis')
    : popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis')
  return popupCard({
    title: escapeHtml(coordinateLabel(point.lat, point.lon)),
    link: { href: caltopoUrl(point.lat, point.lon, view.mapZoom), label: 'Open in CalTopo' },
    meta: metaBand([view.ground ? groundLine(view.ground) : '']),
    action: button,
  })
}
