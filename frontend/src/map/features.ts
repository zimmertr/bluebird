/**
 * Every feature on the map, mounted when the map loads.
 *
 * Where each layer stands is not the mount order's: every module adds its
 * layers through `layerOrder.ts`, which puts each in its slot whenever it goes
 * on, so the radar and the snow, created when they are switched on, still land
 * under the smoke, and the stack comes out the same whatever mounts first
 * (record 0268). The satellite imagery and the ground (`terrain.ts`, #799) add
 * nothing until switched on, but for the one empty layer that carries
 * Mapterhorn's credit (#832). The trailhead and crag markers mount after the
 * basemap patch, which registers the icons they name. The basemap POI popups
 * add no layers and go last.
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
import { mountDestinationCards } from './destinationCards'
import { createGridHeads } from './gridHeads'
import { createGroundReadings } from './groundReadings'
import { serveHeldTiles } from './heldTileProtocol'
import { mountLandmarks, type LandmarkLayer } from './landmarks'
import { mountMapPopups } from './mapPopups'
import { mountClosures, type ClosureOverlay } from './overlays/closures'
import { mountFireActivity, type FireActivityOverlay } from './overlays/fireActivity'
import { mountForecastGrid, type ForecastGridOverlay } from './overlays/forecastGrid'
import { mountImagery, type ImageryOverlay } from './overlays/imagery'
import { mountRadar, type RadarOverlay } from './overlays/radar'
import { mountSmoke, type SmokeOverlay } from './overlays/smoke'
import { mountSnow, type SnowOverlay } from './overlays/snow'
import { mountWildfires, type WildfireOverlay } from './overlays/wildfires'
import { mountPoiPopups, type PoiPopups } from './poiPopup'
import type { PopupBoard } from './popups'
import { mountResultsLayer, type ResultsLayer } from './resultsLayer'
import { mountTerrain, type TerrainLayers } from './terrain'

export interface MapFeatures {
  imagery: ImageryOverlay
  grid: ForecastGridOverlay
  landmarks: LandmarkLayer
  smoke: SmokeOverlay
  wildfires: WildfireOverlay
  areaClosures: ClosureOverlay
  trailClosures: ClosureOverlay
  fireActivity: FireActivityOverlay
  snow: SnowOverlay
  radar: RadarOverlay
  drawRing: DrawRing
  results: ResultsLayer
  pois: PoiPopups
  terrain: TerrainLayers
}

/** The imagery's level from which the contours wear their ink for the photos: half. */
const IMAGERY_INK_LEVEL = 0.5

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
    /** The map opened on a camera a share link named, which the 3D terrain keeps the pitch of (#864). */
    linkCamera?: boolean
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
  // Adds nothing until a switch asks: no elevation tile and no contour code
  // on the cold load.
  const terrain = mountTerrain(map, { linkCamera: deps.linkCamera })
  const grid = mountForecastGrid(map)
  const smoke = mountSmoke(map, { popups: mapPopups })
  const wildfires = mountWildfires(map, { popups: mapPopups })
  const areaClosures = mountClosures(map, 'area', { popups: mapPopups })
  const trailClosures = mountClosures(map, 'trail', { popups: mapPopups })
  const fireActivity = mountFireActivity(map, { popups: mapPopups })
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
  // Every card that describes a place, with one reading of the ground per
  // point off the terrain rows' one elevation source (#832). A click on a
  // marker, a dot or a label opens one through the layer that draws it, and a
  // click on bare map through the map's own.
  const cards = mountDestinationCards(map, {
    controller,
    popups: mapPopups,
    gridHeads: createGridHeads(controller),
    ground: createGroundReadings(terrain),
  })
  mapPopups.registerSpot((at) => {
    cards.open({ kind: 'spot', lat: at.lat, lon: at.lng }, at)
  })
  const results = mountResultsLayer(map, { controller, popups: mapPopups, cards })
  const pois = mountPoiPopups(map, { popups: mapPopups, cards, landmarks })
  // Last: it adds no layer, and its first report is the camera the opening
  // frame left.
  mountCamera(map, { controller })
  return {
    // The Satellite row drives the contours' ink as well as the photos: over
    // the imagery the lines turn light on a dark edge (`terrain.ts`), and
    // back when it goes off. The ink follows the ground that shows most, so
    // under half the photos give way to Liberty's and the lines go back to
    // its brown (record 0250).
    imagery: {
      update(next) {
        imagery.update(next)
        terrain.overImagery(next.show && next.opacity >= IMAGERY_INK_LEVEL)
      },
    },
    grid,
    landmarks,
    smoke,
    wildfires,
    areaClosures,
    trailClosures,
    fireActivity,
    snow,
    radar,
    drawRing,
    results,
    pois,
    terrain,
  }
}
