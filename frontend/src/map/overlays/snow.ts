/**
 * The NOHRSC snow depth field: one raster source and layer, created when the
 * overlay is switched on and torn down when it is switched off.
 *
 * Created on toggle rather than declared at load, for the reason the radar loop
 * is: a raster source starts fetching the moment a rendered layer names it, and
 * every one of those tiles is a render NOAA performs on demand for somebody who
 * never asked for the layer.
 */
import type * as maplibregl from 'maplibre-gl'
import { RADAR_OLDEST_MIN, radarLayerId } from '../../utils/radar'
import { SMOKE_DENSITIES, smokeLayerId } from '../../utils/smoke'
import {
  SNOW_BOUNDS,
  SNOW_LAYER_ID,
  SNOW_MAX_ZOOM,
  SNOW_SOURCE_ID,
  SNOW_TILE_SIZE,
  snowTileUrl,
} from '../../utils/snowDepth'

/**
 * How solid the snow depth field is drawn.
 *
 * Below the radar's 0.65 and above the forecast grid's 0.5, which is where it
 * sits in the layer chain too. Two things bound it. It is a *field*, not a
 * scatter of echoes: a January screen is solid colour from the Cascades to the
 * Rockies, so the terrain and the place names under it have to survive in a way
 * a rain cell never tests. And the radar is drawn on top of it, so the two
 * together must still leave a basemap: 0.55 under 0.65 composites to about a
 * fifth of the ground showing through, which is the floor for reading a lake
 * and a summit label off the map underneath.
 */
export const SNOW_OPACITY = 0.55

/**
 * The layer the field goes beneath.
 *
 * UNDER the radar, which is the one place in the chain it can be: snow is the
 * ground state and rain is what is happening over it. The insertion point says
 * that whichever order the two are switched on: beneath the loop's oldest frame
 * where the loop is already up, and beneath the smoke fills otherwise, which is
 * where the loop itself inserts and therefore leaves room above this.
 */
export function snowBeneath(hasLayer: (id: string) => boolean): string | undefined {
  const underRadar = radarLayerId(RADAR_OLDEST_MIN)
  const beneath = hasLayer(underRadar) ? underRadar : smokeLayerId(SMOKE_DENSITIES[0])
  return hasLayer(beneath) ? beneath : undefined
}

export interface SnowOverlay {
  update(next: { show: boolean }): void
}

export function mountSnow(map: maplibregl.Map): SnowOverlay {
  let showing = false
  return {
    update({ show }) {
      if (show === showing) return
      showing = show
      if (!show) {
        if (map.getLayer(SNOW_LAYER_ID)) map.removeLayer(SNOW_LAYER_ID)
        if (map.getSource(SNOW_SOURCE_ID)) map.removeSource(SNOW_SOURCE_ID)
        return
      }
      const beneath = snowBeneath((id) => Boolean(map.getLayer(id)))
      if (!map.getSource(SNOW_SOURCE_ID)) {
        map.addSource(SNOW_SOURCE_ID, {
          type: 'raster',
          tiles: [snowTileUrl()],
          tileSize: SNOW_TILE_SIZE,
          // The analysis covers the coterminous US and no further, so this is
          // what stops a reader in the Alps paying for a screen of transparent
          // renders: MapLibre requests no tile outside it.
          bounds: SNOW_BOUNDS,
          // Past this the tiles already hold every cell the 1 km analysis has,
          // so a deeper zoom magnifies what is loaded instead of buying another
          // round of renders.
          maxzoom: SNOW_MAX_ZOOM,
          // No `attribution`, for the reason the radar carries none: NOAA's
          // credit is on this layer's own legend, beside the data, and a second
          // copy in MapLibre's control pushes that control onto a second line
          // on a phone.
        })
      }
      if (!map.getLayer(SNOW_LAYER_ID)) {
        map.addLayer(
          {
            id: SNOW_LAYER_ID,
            type: 'raster',
            source: SNOW_SOURCE_ID,
            paint: { 'raster-opacity': SNOW_OPACITY },
          },
          beneath,
        )
      }
    },
  }
}
