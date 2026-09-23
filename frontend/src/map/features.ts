/**
 * Every feature on the map, mounted in the order its layers stack, lowest
 * first, when the map loads.
 *
 * The basemap patch goes under the style's own labels. Above the style: the
 * forecast grid, which is the ground everything else is read against, then
 * smoke, then the fire perimeters, then the drawn ring, so a marker is never
 * under the outline of the area it was found in, then the markers and the
 * pending dots. The radar loop and the snow field are created when they are
 * switched on, beneath the first smoke fill, so the chain comes out grid, snow,
 * radar, smoke, fire, draw, results. The basemap POI popups and the general
 * click add no layers and go last, because a handler registered later answers
 * a click later.
 *
 * One function rather than calls spread through the component's load handler,
 * so the whole stack can be mounted on a stub map and pinned by a test.
 */
import type * as maplibregl from 'maplibre-gl'
import type { GeoPolygon } from '../types'
import { enhanceBasemap } from './basemap'
import { mountMapClick } from './click'
import type { MapController } from './controller'
import { mountDrawRing, type DrawRing } from './drawRing'
import { mountForecastGrid, type ForecastGridOverlay } from './overlays/forecastGrid'
import { mountRadar, type RadarOverlay } from './overlays/radar'
import { mountSmoke, type SmokeOverlay } from './overlays/smoke'
import { mountSnow, type SnowOverlay } from './overlays/snow'
import { mountWildfires, type WildfireOverlay } from './overlays/wildfires'
import { mountPoiPopups, type PoiPopups } from './poiPopup'
import type { PopupBoard } from './popups'
import { mountResultsLayer, type ResultsLayer } from './resultsLayer'

export interface MapFeatures {
  grid: ForecastGridOverlay
  smoke: SmokeOverlay
  wildfires: WildfireOverlay
  snow: SnowOverlay
  radar: RadarOverlay
  drawRing: DrawRing
  results: ResultsLayer
  pois: PoiPopups
}

export function mountFeatures(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    popups: PopupBoard
    // The ring's points, which the component holds because they exist before
    // the map does.
    ring: { current: [number, number][] }
    onPolygonChange: (polygon: GeoPolygon | null) => void
    onDrawUpdate: (count: number) => void
  },
): MapFeatures {
  const { controller, popups } = deps
  // The cursor the map falls back to with nothing interactive under the
  // pointer. A crosshair means the next click places a point, so it belongs
  // to draw mode alone; outside it the default hand says the map is
  // something you move rather than something you mark.
  const restCursor = () => {
    map.getCanvas().style.cursor = controller.inputs.drawing ? 'crosshair' : ''
  }
  restCursor()

  enhanceBasemap(map)
  const grid = mountForecastGrid(map)
  const smoke = mountSmoke(map, { controller, restCursor, popups })
  const wildfires = mountWildfires(map, { restCursor })
  const snow = mountSnow(map)
  const radar = mountRadar(map)
  const drawRing = mountDrawRing(map, {
    ring: deps.ring,
    controller,
    restCursor,
    onPolygonChange: deps.onPolygonChange,
    onDrawUpdate: deps.onDrawUpdate,
  })
  const results = mountResultsLayer(map, { controller, popups, restCursor })
  const pois = mountPoiPopups(map, { controller, popups, restCursor })
  mountMapClick(map, { controller, popups, drawRing, smoke })
  return { grid, smoke, wildfires, snow, radar, drawRing, results, pois }
}
