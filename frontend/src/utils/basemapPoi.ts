// Turning a labeled basemap feature into a destination (#119).
//
// The peak and lake labels on the map both come from OpenMapTiles vector
// tiles, so the name and elevation a click needs are sitting in the feature's
// properties — no lookup, no network call. The job here is only to decide
// which features are destinations at all, and to normalize the tile's fields
// into the `Place` the searched-destinations pipeline already carries end to
// end (map dot → `pins` URL param → `custom_destinations` on the next Analyze).
//
// Trailheads are deliberately absent even though the app discovers them: it
// finds them as `highway=trailhead`, and OpenMapTiles' `poi` layer does not
// source that tag, so there is nothing on the basemap to click. Adding them
// would mean shipping a second data source for a layer the map does not draw.

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

/** The basemap layers a click can turn into a destination. */
export const POI_LAYERS = ['ofm-peaks', ...LAKE_LAYERS] as const

function isLakeLayer(layerId: string): boolean {
  return (LAKE_LAYERS as readonly string[]).includes(layerId)
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

const METERS_PER_FOOT = 0.3048

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
  const ft = Number(props.ele_ft)
  if (Number.isFinite(ft)) return Math.round(ft)
  const m = Number(props.ele)
  if (Number.isFinite(m)) return Math.round(m / METERS_PER_FOOT)
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
  const name = nameOf(props)
  if (name === '') return null
  const [lon, lat] = coordinates
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  const rawClass = typeof props.class === 'string' ? props.class : ''

  if (layerId === 'ofm-peaks') {
    // Every named feature in `mountain_peak` is somewhere a forecast makes
    // sense — saddles and ridges as much as summits — so the class is carried
    // through rather than filtered on. Falling back to "peak" keeps the
    // Peakbagger link working for a tile that omitted the class.
    return { name, kind: rawClass || 'peak', lat, lon, elevationFt: elevationFtOf(props) }
  }

  if (isLakeLayer(layerId)) {
    if (rawClass !== LAKE_CLASS) return null
    // No elevation: `water_name` carries none, and a lake's surface height is
    // not something the tiles know. The next Analyze resolves it against OSM
    // like any other custom coordinate.
    return { name, kind: LAKE_CLASS, lat, lon }
  }

  return null
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
  return Math.hypot(dLat, dLon) <= POI_MATCH_M
}
