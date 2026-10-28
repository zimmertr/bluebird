/**
 * Every feature on the map, mounted in the order its layers stack, lowest
 * first, when the map loads.
 *
 * Lowest of all, the satellite imagery, which adds nothing until it is
 * switched on and then goes directly above the style's background, under
 * every other layer of the style (#799). The basemap patch goes under the style's own labels, and the trailhead and
 * crag markers over it, still under those labels. Above the style: the
 * forecast grid, which is the ground everything else is read against, then
 * smoke, then the fire perimeters, then the closures over the fires that
 * caused them (the closed ground under the closed trails, so a trail reads on
 * top of the area it crosses), then the drawn ring, so a marker is never
 * under the outline of the area it was found in, then the markers and the
 * pending dots. The radar loop and the snow field are created when they are
 * switched on, beneath the first smoke fill, so the chain comes out grid, snow,
 * radar, smoke, fire, closures, draw, results. The basemap POI popups add no
 * layers and go last.
 *
 * The map's popups mount first of all (`map/mapPopups.ts`): every feature that
 * opens a popup registers itself there as it mounts, and the one click that
 * opens any of them is that module's.
 *
 * One function rather than calls spread through the component's load handler,
 * so the whole stack can be mounted on a stub map and pinned by a test.
 */
import { addProtocol } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { GeoPolygon } from '../types'
import { enhanceBasemap } from './basemap'
import { mountCamera } from './camera'
import type { MapController } from './controller'
import { mountDrawRing, type DrawRing } from './drawRing'
import { serveHeldTiles } from './heldTileProtocol'
import { mountLandmarks, type LandmarkLayer } from './landmarks'
import { mountMapPopups } from './mapPopups'
import { mountClosures, type ClosureOverlay } from './overlays/closures'
import { mountForecastGrid, type ForecastGridOverlay } from './overlays/forecastGrid'
import { mountImagery, type ImageryOverlay } from './overlays/imagery'
import { mountRadar, type RadarOverlay } from './overlays/radar'
import { mountSmoke, type SmokeOverlay } from './overlays/smoke'
import { mountSnow, type SnowOverlay } from './overlays/snow'
import { mountWildfires, type WildfireOverlay } from './overlays/wildfires'
import { mountPoiPopups, type PoiPopups } from './poiPopup'
import type { PopupBoard } from './popups'
import { mountResultsLayer, type ResultsLayer } from './resultsLayer'

export interface MapFeatures {
  imagery: ImageryOverlay
  grid: ForecastGridOverlay
  landmarks: LandmarkLayer
  smoke: SmokeOverlay
  wildfires: WildfireOverlay
  areaClosures: ClosureOverlay
  trailClosures: ClosureOverlay
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

  // A click on bare map in draw mode extends the ring, which is mounted
  // below; the click cannot come before the map has finished loading.
  const mapPopups = mountMapPopups(map, { controller, board: popups, addPoint: (pt) => drawRing.addPoint(pt) })

  // Before any layer that loads through them: the radar's and the snow's
  // tiles go through the app's own schemes, which keep a copy to read what
  // they painted (#737).
  serveHeldTiles(addProtocol)
  const imagery = mountImagery(map)
  enhanceBasemap(map)
  // After the basemap patch, which registers the icons its layers name.
  const landmarks = mountLandmarks(map, {})
  const grid = mountForecastGrid(map)
  const smoke = mountSmoke(map, { popups: mapPopups })
  const wildfires = mountWildfires(map, { popups: mapPopups })
  const areaClosures = mountClosures(map, 'area', { popups: mapPopups })
  const trailClosures = mountClosures(map, 'trail', { popups: mapPopups })
  const snow = mountSnow(map, { popups: mapPopups })
  const radar = mountRadar(map, { popups: mapPopups })
  const drawRing = mountDrawRing(map, {
    ring: deps.ring,
    controller,
    popups: mapPopups,
    restCursor,
    onPolygonChange: deps.onPolygonChange,
    onDrawUpdate: deps.onDrawUpdate,
  })
  const results = mountResultsLayer(map, { controller, popups: mapPopups })
  const pois = mountPoiPopups(map, { controller, popups: mapPopups, landmarks })
  // Last: it adds no layer, and its first report is the camera the opening
  // frame left.
  mountCamera(map, { controller })
  return { imagery, grid, landmarks, smoke, wildfires, areaClosures, trailClosures, snow, radar, drawRing, results, pois }
}
