// Turning a labeled basemap feature into a destination (#119, #710).
//
// Every clickable label on the map comes from the OpenMapTiles vector tiles:
// the peaks and lakes the app draws itself, and the cities, towns, villages
// and hamlets the style already labels. So the name and elevation a click
// needs are sitting in the feature's properties: no lookup, no network call.
// The job here is only to decide which features are destinations at all, and
// to normalize the tile's fields into the `Place` the searched-destinations
// pipeline already carries end to end (map dot → `pins` URL param →
// `custom_destinations` on the next Analyze).
//
// Trailheads are deliberately absent even though the app discovers them: it
// finds them as `highway=trailhead`, and OpenMapTiles' `poi` layer does not
// source that tag, so there is nothing on the basemap to click (measured
// 2026-10-15 at Mount Si: its trailhead is in the tile only as a bus stop and
// a parking lot). Adding them would mean shipping a second data source for a
// layer the map does not draw.

import { Place } from './geocode'

/**
 * The lake label layers.
 *
 * Two, because OpenMapTiles splits `water_name` by geometry: a compact lake
 * gets a point to label, a long one gets a line to bend text along. MapLibre
 * will not place a point-anchored symbol on a line geometry — measured, it
 * simply draws nothing — so the line case needs its own layer with
 * `symbol-placement: line-center`. Both are styled identically and both mean
 * the same thing here, which is why callers work from this list rather than
 * from either id.
 */
export const LAKE_LAYERS = ['ofm-lakes', 'ofm-lakes-line'] as const

/**
 * The style's own place labels, which a click takes where the style draws
 * them (#710).
 *
 * The Liberty style's ids rather than layers of ours: it already labels
 * settlements well, so the app adds a glow under each and no label. Hamlets
 * have no layer of their own: they ride `label_other`, which labels every
 * place class the style names no layer for, suburbs, neighbourhoods and
 * islands among them. That is why `PLACE_CLASSES` is the guard rather than
 * the layer, here and in the glow's filter. A Liberty update that renames one
 * of these ids drops it as a target without an error, because both the glow
 * and the click target skip an id the loaded style does not carry.
 */
export const PLACE_LAYERS = [
  'label_city',
  'label_city_capital',
  'label_town',
  'label_village',
  'label_other',
] as const

/** The place classes that are destinations: settlements, not districts or islands. */
export const PLACE_CLASSES = ['city', 'town', 'village', 'hamlet'] as const

/** The basemap layers a click can turn into a destination. */
export const POI_LAYERS = ['ofm-peaks', ...LAKE_LAYERS, ...PLACE_LAYERS] as const

function isLakeLayer(layerId: string): boolean {
  return (LAKE_LAYERS as readonly string[]).includes(layerId)
}

function isPlaceLayer(layerId: string): boolean {
  return (PLACE_LAYERS as readonly string[]).includes(layerId)
}

function isPlaceClass(kind: string): boolean {
  return (PLACE_CLASSES as readonly string[]).includes(kind)
}

/**
 * The one `water_name` class the app draws and accepts as a destination.
 *
 * `water_name` labels every named water body, and most of them are not places
 * a forecast is wanted for: an ocean or a bay is a span, not a point, and its
 * label sits at whatever centroid the tile chose, which can be hundreds of
 * miles from any shoreline.
 *
 * Two things read this and must agree, so it lives here rather than in the map
 * component: `ofm-lakes` filters its features on it (see `enhanceBasemap` in
 * `MapView.tsx`, which also filters the style's own water labels *off* it so
 * the two layers cannot label the same point), and `poiFromFeature` below
 * refuses anything else. The layer filter is the real guard; the check below
 * is what keeps this module honest on its own, without a map to ask.
 */
export const LAKE_CLASS = 'lake'

// The server's own metres→feet factor (`_ele_ft` in osm/query.py), used only
// for a tile that carries metres and no feet. The agreement matters more than
// it looks: an unnamed summit is NAMED from its elevation, so a one-foot
// disagreement makes `Peak 5961` and `Peak 5962` two destinations for one
// mountain — and neither dedup rule catches it, since the backend merges a
// custom row into a discovered one by exact name or 5-decimal coordinate, and
// a clicked coordinate is tile-snapped by up to ~20 m.
const FEET_PER_METER = 3.28084

/**
 * How close two POIs must be to count as the same one.
 *
 * A vector tile stores point coordinates on a 4096-unit grid, so what
 * `queryRenderedFeatures` hands back is the grid cell rather than the exact
 * OSM node: at the peak layer's minzoom of 9 that is 360/(2^9 × 4096) degrees,
 * about 20 m at the equator and less at latitude. Clicking the same summit at
 * two different zooms therefore yields two slightly different coordinates, and
 * a coordinate-keyed store would hold both.
 *
 * 60 m is three times the worst-case grid error, and far below the distance at
 * which two distinct summits would share a name — which the check also
 * requires, so this only ever merges a feature with itself.
 */
export const POI_MATCH_M = 60

/**
 * The same tolerance for a clicked place, which the tile snaps far more
 * coarsely than a summit.
 *
 * A city is labelled from the style's `label_city` minzoom of 3, where the
 * grid is 360/(2^3 × 4096) degrees, 1.22 km at the equator, so one city
 * clicked at z4 and again at z12 can come back more than a kilometre apart
 * and the popup would offer to add it a second time. 4 km is over three of
 * those cells, the margin `POI_MATCH_M` keeps for summits. The name must match
 * too, and two settlements that share a name are rarely that close.
 */
export const PLACE_MATCH_M = 4_000

const M_PER_DEG_LAT = 111_320

export interface BasemapPoi {
  name: string
  // OSM's own word for the feature, as `Place.kind` carries it — "peak",
  // "volcano", "lake". `isPeakKind` reads it to decide the Peakbagger link, so
  // it has to stay the tile's value rather than a category of our own.
  kind: string
  lat: number
  lon: number
  elevationFt?: number
}

// The tile's name fields, in the order the Liberty style itself prefers. A
// feature with none of them is unlabeled on the map, so there is nothing the
// user could have meant to click.
function nameOf(props: Record<string, unknown>): string {
  for (const field of ['name', 'name:latin', 'name_en', 'name:en']) {
    const value = props[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

// OpenMapTiles publishes `ele` in meters and `ele_ft` alongside it, but only
// where OSM tagged an elevation at all. Prefer the feet the tile computed;
// convert from meters when it is the only one present.
function elevationFtOf(props: Record<string, unknown>): number | undefined {
  // `ele_ft` first, because it is the one the server agrees with. The tiles
  // come from Planetiler, which rounds `ele` to whole metres but computes
  // `ele_ft` from OSM's raw metres, decimals included, the same raw value the
  // server's `_ele_ft` converts. Converting the rounded metres loses up to half
  // a metre, 1.6 ft: Agnes Mountain's raw 2473.4 m is 8115 ft to the server
  // and in the tile's `ele_ft`, but its tile `ele` of 2473 converts to 8114
  // (#581). The two factors (3.28084 here and on the server, 3.2808399 in
  // Planetiler) differ only past the fifth decimal, so they round apart only
  // when a value lands within a thousandth of a foot of a half.
  const ft = Number(props.ele_ft)
  if (Number.isFinite(ft)) return Math.round(ft)
  const m = Number(props.ele)
  if (Number.isFinite(m)) return Math.round(m * FEET_PER_METER)
  return undefined
}

/**
 * A clicked basemap feature as a destination, or null if it is not one.
 *
 * `coordinates` is the rendered geometry, which is the tile grid cell rather
 * than the exact OSM node — see POI_MATCH_M. That imprecision is absorbed
 * downstream: the backend merges a custom destination into a discovered one by
 * exact name as well as by coordinate, and `enrich_custom` resolves the point
 * against OSM within 150 m to fill in the elevation and `osm_id` a tile cannot
 * carry. A weather grid cell is kilometers wide, so it changes no forecast.
 */
export function poiFromFeature(
  layerId: string,
  props: Record<string, unknown>,
  coordinates: [number, number],
): BasemapPoi | null {
  const [lon, lat] = coordinates
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  const rawClass = typeof props.class === 'string' ? props.class : ''
  const elevationFt = elevationFtOf(props)
  // An unnamed summit is still a summit, and the map already draws it — as a
  // bare elevation, since that is all OSM knows about it. Refusing the click
  // made the glow a promise the map did not keep: hovering the panel lit every
  // peak, and half of them then did nothing.
  //
  // "Peak 5961" is what climbers call these, and it is the elevation already
  // on screen, so the destination is named after the thing that was clicked.
  // Unpunctuated deliberately: it is an identifier here, not a measurement, and
  // "Peak 5,961" reads like a truncated sentence.
  const name =
    nameOf(props) ||
    (layerId === 'ofm-peaks' && elevationFt !== undefined ? `Peak ${elevationFt}` : '')
  if (name === '') return null

  if (layerId === 'ofm-peaks') {
    // Every named feature in `mountain_peak` is somewhere a forecast makes
    // sense — saddles and ridges as much as summits — so the class is carried
    // through rather than filtered on. Falling back to "peak" keeps the
    // Peakbagger link working for a tile that omitted the class.
    return { name, kind: rawClass || 'peak', lat, lon, elevationFt }
  }

  if (isLakeLayer(layerId)) {
    if (rawClass !== LAKE_CLASS) return null
    // No elevation: `water_name` carries none, and a lake's surface height is
    // not something the tiles know. The next Analyze resolves it against OSM
    // like any other custom coordinate.
    return { name, kind: LAKE_CLASS, lat, lon }
  }

  if (isPlaceLayer(layerId)) {
    // The class check is the guard `label_other` needs (see PLACE_LAYERS),
    // and the class is the kind, so the Type column says `Town`. The `place`
    // layer carries no elevation.
    if (!isPlaceClass(rawClass)) return null
    return { name, kind: rawClass, lat, lon }
  }

  return null
}

/**
 * Whether a label drawn on one of `POI_LAYERS` is a destination at all, with
 * no position needed. The cursor asks this on every move (`accepts` in
 * `map/mapPopups.ts`), so a suburb's label shows no pointer for a click that
 * would open nothing.
 */
export function isPoiFeature(layerId: string, props: Record<string, unknown>): boolean {
  return poiFromFeature(layerId, props, [0, 0]) !== null
}

/** The searched-place record a POI becomes, so both inputs share one pipeline. */
export function poiToPlace(poi: BasemapPoi): Place {
  return {
    label: poi.name,
    // The map is the disambiguation: you clicked this label, in this view.
    description: '',
    kind: poi.kind,
    lat: poi.lat,
    lon: poi.lon,
    ...(poi.elevationFt !== undefined ? { elevationFt: poi.elevationFt } : {}),
    // No `osmId`: OpenMapTiles drops the source id from `mountain_peak` and
    // `water_name`. The backend fills it in on the next Analyze by resolving
    // the coordinate against OSM.
  }
}

/**
 * Is this already-registered place the POI that was just clicked?
 *
 * Name and proximity together, because neither alone is enough: coordinates
 * drift with the tile grid, and names repeat across a range.
 */
export function samePoi(poi: BasemapPoi, place: Pick<Place, 'label' | 'lat' | 'lon'>): boolean {
  if (poi.name.toLowerCase() !== place.label.toLowerCase()) return false
  const dLat = (poi.lat - place.lat) * M_PER_DEG_LAT
  const dLon =
    (poi.lon - place.lon) * M_PER_DEG_LAT * Math.cos(((poi.lat + place.lat) / 2 / 180) * Math.PI)
  return Math.hypot(dLat, dLon) <= (isPlaceClass(poi.kind) ? PLACE_MATCH_M : POI_MATCH_M)
}
