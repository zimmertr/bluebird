import { BasemapPoi } from './basemapPoi'
import { caltopoUrl } from './caltopoUrl'
import { destinationLinkLabel, destinationUrl } from './destinationUrl'
import { placeType } from './geocode'
import { escapeHtml, factsRow, metaBand, popupAction, popupButton, popupCard } from './popup/popupChrome'
import { elevationFact } from './popup/popupRows'
import { TYPE_COL } from './tableColumns'
import type { UsStates } from './usStates'

// The popup a clicked map label opens (#119): a peak, a lake, a place, a
// trailhead or a crag.
//
// It wears the result card itself (#712, TJ 2026-10-14): the name and the
// link out on the header band, the type, elevation and coordinates on the
// facts line under them, and the body below the band's edge. A destination
// you clicked and the same destination once analyzed are one object at two
// stages, and before #712 they read as two kinds of card, this one with a rule
// and an "Elevation (ft)" row where the other had a band and a facts line.
// What it does not show is a forecast: nothing has been fetched for this point
// yet, that is what adding it and running Analyze is for, and a result popup
// with empty metrics would read as a failed lookup rather than an un-run one.

// The attribute the map handler looks for to wire the button back to React.
// One attribute for both states, with the action in its value, so the handler
// reads the intent off the element instead of inferring it from which selector
// matched.
export const POI_ACTION_ATTR = 'data-poi-action'

/**
 * Where a clicked feature links out to, by the rule an analyzed row follows
 * (`destinationUrl`): a peak to Peakbagger's coordinate search, a crag to
 * Mountain Project, and anything with an OSM id, which only the pod's
 * trailheads carry (#734), to that object. A tile label has no id, so the
 * rest fall back to an OSM pin at the point, which is what a custom row gets
 * for the same reason.
 */
function poiUrl(poi: BasemapPoi, states: UsStates | null): string {
  return destinationUrl(
    {
      name: poi.name,
      type: placeType(poi.kind),
      latitude: poi.lat,
      longitude: poi.lon,
      osm_id: poi.osmId ?? null,
    },
    states,
  )
}

/**
 * The kind on the facts line, the word the table's Type column will use for
 * the same place once it is analyzed, through that column's own format. A
 * place with no kind says nothing rather than "Custom", which is a statement
 * about how a row got here and not about what the feature is.
 */
function poiTypeFact(poi: BasemapPoi): string | null {
  const type = placeType(poi.kind)
  return type === 'custom' ? null : String(TYPE_COL.format!(type))
}

/**
 * @param added Whether this POI is already a destination, which flips the
 * button from adding to removing. Clicking a peak you have already added is a
 * question about that peak, and the honest answer to it is the way back out.
 * @param mapZoom The map's zoom when the card is drawn, which the coordinates'
 * CalTopo link carries (#712); a card built with no map links without one.
 * @param states The state outlines a crag's search names its state by, when
 * held (`usStates.ts`).
 */
export function poiPopupHtml(
  poi: BasemapPoi,
  added: boolean,
  mapZoom?: number,
  states: UsStates | null = null,
): string {
  // The button stands alone in the body, under the band's edge, with the
  // body's own padding around it; it needs no gap of its own. It is centred
  // the way every card's lone action is (`popupAction`).
  const button = added
    ? popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis')
    : popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis')
  const action = popupAction(button)

  // The facts line a ranked result wears, from what the tile knows: the kind,
  // the elevation where there is one, and the coordinates. The elevation used
  // to be a row under the rule, "Elevation (ft): 8,885", while a result card
  // said "8,885 ft" on the band for the same mountain (#712).
  const meta = metaBand([
    factsRow(
      poiTypeFact(poi),
      poi.elevationFt !== undefined ? elevationFact(poi.elevationFt) : null,
      poi.lat,
      poi.lon,
      caltopoUrl(poi.lat, poi.lon, mapZoom),
    ),
  ])

  // The name is OSM's, so it is third-party text on its way to setHTML.
  const link = { href: poiUrl(poi, states), label: destinationLinkLabel(placeType(poi.kind)) }
  return popupCard({ title: escapeHtml(poi.name), link, meta, body: action })
}
