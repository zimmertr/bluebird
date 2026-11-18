/**
 * The finished areas (record 0306): each area's shape in the draw colour and
 * its number inside it, the number its chip in the Destinations section
 * names. The ring being drawn or edited is `drawRing.ts`'s, the one editable
 * shape; these never take a click, so a peak inside an area stays clickable.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { GeoPolygon } from '../types'
import { areasData } from '../utils/drawGeometry'
import { addLayerAt } from './layerOrder'
import { AREA_LABEL_LAYOUT, AREA_LABEL_PAINT, DRAW_COLOR, DRAW_FILL_OPACITY, DRAW_LINE_WIDTH } from './mapStyles'

export interface AreasLayer {
  /** Draw these areas, leaving out the one at `hidden` (the one being edited). */
  set: (areas: readonly GeoPolygon[], hidden: number | null) => void
}

export function mountAreasLayer(map: maplibregl.Map): AreasLayer {
  map.addSource('areas', { type: 'geojson', data: areasData([], null) as FeatureCollection })
  addLayerAt(map, {
    id: 'areas-fill',
    type: 'fill',
    source: 'areas',
    filter: ['==', ['get', 'kind'], 'area'],
    paint: { 'fill-color': DRAW_COLOR, 'fill-opacity': DRAW_FILL_OPACITY },
  })
  addLayerAt(map, {
    id: 'areas-line',
    type: 'line',
    source: 'areas',
    filter: ['==', ['get', 'kind'], 'area'],
    paint: { 'line-color': DRAW_COLOR, 'line-width': DRAW_LINE_WIDTH },
  })
  addLayerAt(map, {
    id: 'areas-label',
    type: 'symbol',
    source: 'areas',
    filter: ['==', ['get', 'kind'], 'label'],
    layout: { 'text-field': ['get', 'n'], ...AREA_LABEL_LAYOUT },
    paint: AREA_LABEL_PAINT,
  })
  return {
    set(areas, hidden) {
      const source = map.getSource('areas') as maplibregl.GeoJSONSource | undefined
      source?.setData(areasData(areas, hidden) as FeatureCollection)
    },
  }
}
