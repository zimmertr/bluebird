/**
 * The forecast grid overlay's drawing: the image source and raster layer the
 * field is painted into, the per-cell wind arrows, and the canvas that turns a
 * raster into pixels.
 *
 * Everything that decides what the field looks like is `utils/forecastGrid.ts`,
 * which is pure and tested; this file is the part that needs a map and a
 * canvas. The layers are added once, when the map loads, lowest of every
 * overlay, because the field is the ground the rain, smoke, fire and markers
 * are all read against.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { SortBy } from '../../types'
import { WIND_ARROW_IMAGE, emptyFC, makeArrowImage, setSource } from '../basemap'
import {
  gridArrowFeatures,
  gridImageCoordinates,
  gridRaster,
  type GridCell,
  type GridRaster,
  type GridSpec,
  type GridStyle,
} from '../../utils/forecastGrid'

/**
 * How solid the forecast field is drawn.
 *
 * Below the radar's 0.65 because this is the layer most likely to be under
 * everything else at once: the field is the ground the markers, plumes and
 * perimeters are read against, and terrain has to survive under it or the map
 * stops being a map. Far enough above nothing that a whole field of green still
 * reads as green at a glance.
 */
export const GRID_OPACITY = 0.5

/**
 * How a per-cell wind arrow is drawn against the markers' own.
 *
 * Smaller and dimmer, because both are on screen at once during a wind scrub
 * and at equal weight a field of hundreds of cell arrows buries the handful
 * actually attached to a ranked destination. Two channels rather than one:
 * measured on a 3 km lattice over Rainier, opacity alone still left the two
 * kinds of arrow reading as one field.
 */
export const GRID_ARROW_OPACITY = 0.5
export const GRID_ARROW_SIZE = 0.7

export interface GridDrawing {
  spec: GridSpec | null
  cells: GridCell[]
  style: GridStyle
  sortBy: SortBy
  playbackIndex: number | null
}

/**
 * Which half of the drawing a change reaches.
 *
 * The field is recoloured from all five inputs. The arrows read only the cells
 * and the hour, so a style switch or a re-rank leaves their source alone.
 * Compared by identity, the way a React dependency list compares, because the
 * cells arrive as one array per fetch and are never edited in place.
 */
export function gridRedraws(
  prev: GridDrawing | null,
  next: GridDrawing,
): { field: boolean; arrows: boolean } {
  if (!prev) return { field: true, arrows: true }
  const arrows = prev.cells !== next.cells || prev.playbackIndex !== next.playbackIndex
  const field =
    arrows || prev.spec !== next.spec || prev.style !== next.style || prev.sortBy !== next.sortBy
  return { field, arrows }
}

// The raster as something an image source will take: a decoded canvas, handed
// straight to `updateImage` with no encode, no fetch and no decode in between.
// A canvas is what carries the pixels, which is why this lives here rather
// than in utils/forecastGrid.ts: everything up to the buffer is pure and
// tested, and this is the DOM the last step needs. Returns null where there is
// no canvas at all (jsdom-less test environments), which simply leaves the
// field undrawn.
export function rasterImage(raster: GridRaster): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas')
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Copied into the canvas's own ImageData rather than constructing one around
  // the buffer: TS types `ImageData`'s constructor against a plain ArrayBuffer,
  // and a Uint8ClampedArray is not narrowed to one. The copy is 600 pixels.
  const image = ctx.createImageData(raster.width, raster.height)
  image.data.set(raster.rgba)
  ctx.putImageData(image, 0, 0)
  return canvas
}

export interface ForecastGridOverlay {
  update(next: GridDrawing): void
}

export function mountForecastGrid(map: maplibregl.Map): ForecastGridOverlay {
  // The arrow image is registered here rather than with the results layers,
  // since this is the first layer to name it.
  const arrow = makeArrowImage()
  if (arrow && !map.hasImage(WIND_ARROW_IMAGE)) map.addImage(WIND_ARROW_IMAGE, arrow)
  // The field itself is an IMAGE source, one pixel per sample, stretched over
  // the lattice's outer bounds. The smoothing between samples is then
  // `raster-resampling: linear` on the GPU, which is both free and the bilinear
  // the field is entitled to between adjacent model grid cells. Interpolating
  // in JavaScript instead would mean shipping a resampler the renderer already
  // contains and re-running it per zoom.
  //
  // Declared with no url, which is a source that starts empty and draws nothing
  // until an image is set on it. The field arrives by `updateImage` as pixels
  // this file has already decoded, so the source never fetches anything and
  // there is no decode that can fail silently. Clearing the field is therefore
  // the layer's visibility rather than a second image: an image source holds
  // the last image it was given, so there is no way to hand it emptiness.
  map.addSource('forecast-grid', {
    type: 'image',
    coordinates: [
      [-180, 85],
      [180, 85],
      [180, -85],
      [-180, -85],
    ],
  })
  // One layer for both styles. Blocks and smooth are the same image magnified
  // with different filters: `nearest` draws one hard square per sample,
  // `linear` blends between them. So the whole style switch is a paint
  // property, with no second layer to keep in step and no stacking order to
  // re-establish on a change.
  map.addLayer({
    id: 'forecast-grid-fill',
    type: 'raster',
    source: 'forecast-grid',
    // Hidden until a raster exists, and hidden again whenever one stops
    // existing. This is the only thing that takes the field off the map.
    layout: { visibility: 'none' },
    paint: {
      'raster-opacity': GRID_OPACITY,
      'raster-resampling': 'nearest',
      // Zero for the reason the radar loop learned the hard way: a scrub
      // replaces the image every frame, and the library's own cross-fade would
      // leave two hours of the forecast half-drawn on top of each other for the
      // length of it.
      'raster-fade-duration': 0,
    },
  })
  // Arrows ride their own point source, because MapLibre has no way to place a
  // symbol per texel of a raster.
  map.addSource('forecast-grid-arrows', {
    type: 'geojson',
    data: emptyFC as FeatureCollection,
  })
  map.addLayer({
    id: 'forecast-grid-wind',
    type: 'symbol',
    source: 'forecast-grid-arrows',
    filter: ['has', 'bearing'],
    layout: {
      'icon-image': WIND_ARROW_IMAGE,
      'icon-rotate': ['get', 'bearing'],
      'icon-size': GRID_ARROW_SIZE,
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      visibility: 'none',
    },
    paint: { 'icon-opacity': GRID_ARROW_OPACITY },
  })

  // The field, on the same contract as the markers: one redraw per scrub tick,
  // recoloured from series the browser already holds and costing nothing
  // upstream. What gets re-encoded is a ~25x24 image, so this is cheaper than
  // the marker path. The expensive-looking part, magnifying it across the
  // viewport, is the GPU's.
  function drawField({ spec, cells, style, sortBy, playbackIndex }: GridDrawing) {
    map.setPaintProperty(
      'forecast-grid-fill',
      'raster-resampling',
      style === 'smooth' ? 'linear' : 'nearest',
    )
    const source = map.getSource('forecast-grid') as maplibregl.ImageSource | undefined
    if (!source) return
    const raster = spec && gridRaster(spec, cells, sortBy, playbackIndex, style)
    const image = spec && raster ? rasterImage(raster) : null
    if (!spec || !image) {
      map.setLayoutProperty('forecast-grid-fill', 'visibility', 'none')
      return
    }
    source.updateImage({ image, coordinates: gridImageCoordinates(spec) })
    map.setLayoutProperty('forecast-grid-fill', 'visibility', 'visible')
  }

  let drawn: GridDrawing | null = null
  return {
    update(next) {
      const { field, arrows } = gridRedraws(drawn, next)
      drawn = next
      if (field) drawField(next)
      // Empty at rest, which is what `gridArrowFeatures` returns when there is
      // no hour under the playhead to have a direction.
      if (arrows) {
        setSource(map, 'forecast-grid-arrows', gridArrowFeatures(next.cells, next.playbackIndex))
      }
    },
  }
}
