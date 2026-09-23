/**
 * The one click on the map that is not on a layer of its own: every layer a
 * click can land on is asked in one query, and `utils/mapClick.ts` decides from
 * the whole answer what the click means (open a fire's page, place a point,
 * open a plume's popup, or clear the popups).
 *
 * The layers that open popups of their own (a marker, a basemap label) keep
 * their handlers in their modules; this one decides only whether their click
 * also clears the board.
 */
import type * as maplibregl from 'maplibre-gl'
import { POI_LAYERS } from '../utils/basemapPoi'
import { dismissesPopups, resolveMapClick, type MapClickHits } from '../utils/mapClick'
import { SMOKE_CLICK_ORDER, type SmokeProps } from '../utils/smoke'
import type { MapController } from './controller'
import type { DrawRing } from './drawRing'
import { WILDFIRE_FILL_LAYER, fireLinkAt } from './overlays/wildfires'
import type { SmokeOverlay } from './overlays/smoke'
import { isPinning, type PopupBoard } from './popups'
import { RESULT_MARKER_LAYER } from './resultsLayer'

export function mountMapClick(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: PopupBoard
    drawRing: Pick<DrawRing, 'addPoint'>
    smoke: Pick<SmokeOverlay, 'openPopup'>
  },
): void {
  const { controller, popups, drawRing, smoke } = deps
  // Every layer a click can land on, asked in one query, because the rule
  // that decides between them (`utils/mapClick.ts`) reads the whole set
  // rather than a series of answers. The draw handles are in the list so
  // that grabbing one cannot also drop a vertex; they are hidden outside
  // draw mode and MapLibre does not query a hidden layer, which is what
  // keeps a click outside that mode from being a vertex at all (#119).
  const clickLayers = [
    ...POI_LAYERS,
    RESULT_MARKER_LAYER,
    ...SMOKE_CLICK_ORDER,
    WILDFIRE_FILL_LAYER,
    'draw-vertices',
    'draw-midpoints',
  ]

  map.on('click', (e) => {
    const under = map.queryRenderedFeatures(e.point, {
      layers: clickLayers.filter((id) => map.getLayer(id)),
    })
    const hitLayers = new Set(under.map((f) => f.layer.id))
    const hits: MapClickHits = {
      drawing: controller.inputs.drawing,
      pinning: isPinning(e),
      fire: hitLayers.has(WILDFIRE_FILL_LAYER),
      result: hitLayers.has(RESULT_MARKER_LAYER),
      poi: POI_LAYERS.some((id) => hitLayers.has(id)),
      vertex: hitLayers.has('draw-vertices') || hitLayers.has('draw-midpoints'),
      smoke: SMOKE_CLICK_ORDER.filter((id) => hitLayers.has(id)),
    }

    if (dismissesPopups(hits)) popups.closeAll()

    const action = resolveMapClick(hits)
    if (action.kind === 'open-fire') {
      window.open(fireLinkAt(map, e.lngLat), '_blank', 'noopener,noreferrer')
      return
    }
    if (action.kind === 'add-vertex') {
      drawRing.addPoint([e.lngLat.lng, e.lngLat.lat])
      return
    }
    if (action.kind === 'open-smoke') {
      const plume = under.find((f) => f.layer.id === action.layer)
      if (plume?.properties) {
        smoke.openPopup(plume.properties as SmokeProps, e.lngLat, hits.pinning)
      }
    }
  })
}
