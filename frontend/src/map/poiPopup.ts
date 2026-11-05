/**
 * The clickable map labels (the peaks, lakes, places, trailheads and crags
 * `utils/basemapPoi.ts` lists): which place a click on one names, and the glow
 * that lights them all while the panel points at them. The card it opens, and
 * the button in it that adds the place as a destination or takes it back
 * out, are every card's (`destinationCards.ts`, #832).
 *
 * The map already holds these features, the tile labels from the
 * OpenMapTiles source and the trailheads and crags from the pod
 * (`GET /api/landmarks`), so the click costs no lookup: the name and
 * elevation are in the feature's own properties. Adding one registers it
 * exactly as a search by name does, which is why this needs no pipeline of
 * its own: it lands in the same list, the same URL param, and the same
 * `custom_destinations` on the next Analyze.
 *
 * The layers themselves are others' (`enhanceBasemap` and `mountLandmarks`
 * add them), so this module adds none. It registers them as a click target
 * (`map/mapPopups.ts`).
 */
import type * as maplibregl from 'maplibre-gl'
// TS 7 no longer resolves @types/geojson's UMD global namespace from module
// files, so the types must be imported explicitly.
import type { Point } from 'geojson'
import { isPoiFeature, LAKE_LAYERS, POI_LAYERS, poiFromFeature } from '../utils/basemapPoi'
import { landmarkKindOf } from '../utils/landmarks'
import { lakeAnchor } from './basemap'
import type { DestinationCards } from './destinationCards'
import type { LandmarkLayer } from './landmarks'
import type { MapPopups } from './mapPopups'

export interface PoiPopups {
  /** Light every clickable label, or put them back. */
  setPointed(pointed: boolean): void
}

export function mountPoiPopups(
  map: maplibregl.Map,
  deps: {
    popups: MapPopups
    /** Every card on the map, which a label's click opens. */
    cards: DestinationCards
    /** The marker layer, asked for a clicked trailhead's or crag's exact point. */
    landmarks?: Pick<LandmarkLayer, 'pointOf'>
  },
): PoiPopups {
  const { popups, cards, landmarks } = deps

  // A label under a ranked marker, a draw handle or anything else that
  // outranks it is the rank's call (`utils/mapClick.ts`), and in draw mode
  // these are scenery a polygon corner can land on.
  popups.register({
    target: 'poi',
    layers: POI_LAYERS,
    accepts: (feature) => !!feature.properties && isPoiFeature(feature.layer.id, feature.properties),
    // A label that names no place (no name, or no usable position) has
    // nothing to add, so the click falls to whatever lies under it.
    open: ({ feature, lngLat, point }) => {
      if (!feature.properties) return false
      const layer = feature.layer.id
      // A peak or a place labels its own point. A lake's label geometry is a
      // tile artifact (a point for a compact one, a line for a long one), so
      // it is resolved against the water itself; the click point is the
      // fallback, and it is on the lake because that is what was clicked. A
      // trailhead or a crag is drawn from a tiled GeoJSON source, whose
      // geometry is snapped to the tile grid, so its exact point is read
      // back off the layer that fetched it (`pointOf`).
      const clicked: [number, number] = [lngLat.lng, lngLat.lat]
      const drawn =
        feature.geometry.type === 'Point'
          ? ((feature.geometry as Point).coordinates as [number, number])
          : clicked
      const osmId = typeof feature.properties.osm_id === 'string' ? feature.properties.osm_id : null
      const anchor =
        (LAKE_LAYERS as readonly string[]).includes(layer)
          ? lakeAnchor(map, point, clicked)
          : landmarkKindOf(layer) !== null && osmId !== null
            ? (landmarks?.pointOf(osmId) ?? drawn)
            : drawn
      const poi = poiFromFeature(layer, feature.properties, anchor)
      if (!poi) return false
      cards.open({ kind: 'label', poi }, [poi.lon, poi.lat])
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
