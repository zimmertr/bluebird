/**
 * The NOHRSC snow depth field: one raster source and layer, created when the
 * overlay is switched on and torn down when it is switched off.
 *
 * Created on toggle rather than declared at load, for the reason the radar loop
 * is: a raster source starts fetching the moment a rendered layer names it, and
 * every one of those tiles is a render NOAA performs on demand for somebody who
 * never asked for the layer.
 *
 * The renders load through the app's own scheme (`../heldTileProtocol.ts`),
 * which keeps a copy of every tile, so painted snow answers the pointer and a
 * click on it opens a card at once, named from the pixel, while NOAA is asked
 * for the numbers (`utils/snowPoint.ts`, #737): a point target, since a
 * raster layer has no feature for a click to find.
 *
 * A card open when the field comes on, or over ground whose tile had not
 * arrived when it opened, has nothing to read until the tile does, so the
 * open cards read the snow again as each of its tiles arrives, as they do
 * the radar's (#832). What a point answered is kept while the field is on,
 * so those reads, and a second click on the same place, show the reading the
 * card already had rather than asking NOAA again behind a row of bars.
 */
import type * as maplibregl from 'maplibre-gl'
import type { HeldTiles } from '../../utils/heldTiles'
import { SNOW_TILES } from '../heldTileProtocol'
import type { MapPopups } from '../mapPopups'
import { RADAR_OLDEST_MIN, radarLayerId } from '../../utils/radar'
import { SMOKE_DENSITIES, smokeLayerId } from '../../utils/smoke'
import {
  SNOW_BOUNDS,
  SNOW_HELD_URL,
  SNOW_LAYER_ID,
  SNOW_MAX_ZOOM,
  SNOW_SOURCE_ID,
  SNOW_TILE_SIZE,
} from '../../utils/snowDepth'
import type { MapPoint, PointAnswer, PointReading } from '../../utils/pointReadout'
import { whenReady } from '../../utils/pointReadout'
import { SNOW_HELD_LAYER, readSnowAt, snowPaints, snowTileZoom } from '../../utils/snowPoint'

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

/** How many points' readings the field keeps while it is on, oldest dropped first. */
const KEPT_READINGS = 64

export function mountSnow(
  map: maplibregl.Map,
  deps: {
    popups: MapPopups
    tiles?: HeldTiles
    /** How a point is read, `readSnowAt` by default; a test's stand-in asks NOAA nothing. */
    readAt?: (tiles: HeldTiles, at: MapPoint, signal: AbortSignal) => PointAnswer
  },
): SnowOverlay {
  const tiles = deps.tiles ?? SNOW_TILES
  const readAt = deps.readAt ?? readSnowAt
  let showing = false
  // Each point's reading while the field is on, and whether NOAA failed it.
  // NOAA is asked under the field's own signal rather than a card's, because
  // one answer serves every card on the point, and a card that closes does
  // not take it from the next one. Switching the field off aborts them.
  const kept = new Map<string, { reading: PointReading; failed: boolean }>()
  let asking = new AbortController()
  const keyOf = (at: MapPoint) => `${at.lng},${at.lat},${snowTileZoom(at.zoom)}`

  function keep(key: string, reading: PointReading | null): PointReading | null {
    if (reading === null) return null
    const entry = { reading, failed: false }
    kept.set(key, entry)
    while (kept.size > KEPT_READINGS) kept.delete(kept.keys().next().value!)
    reading.later?.then(
      (section) => {
        if (kept.get(key) !== entry) return
        // A failed section carries no time (`failedSnowSection`).
        kept.set(key, { reading: { section }, failed: section.when === undefined })
      },
      () => {
        if (kept.get(key) === entry) kept.delete(key)
      },
    )
    return reading
  }

  // A fresh ask (a card opening) tries NOAA again where it failed, since
  // the reader's next click is the next attempt (`snowPoint.ts`); a card
  // read again as tiles arrive keeps the failure it already shows, so a
  // failing NOAA is not asked once a tile.
  function readKept(at: MapPoint, fresh: boolean): PointAnswer {
    const key = keyOf(at)
    const held = kept.get(key)
    if (held && !(fresh && held.failed)) return held.reading
    return whenReady(readAt(tiles, at, asking.signal), (reading) => keep(key, reading))
  }

  deps.popups.registerPoint({
    target: 'snow',
    shown: () => showing,
    paints: (at) => snowPaints(tiles, at),
    read: (at) => readKept(at, true),
    refresh: (at) => readKept(at, false),
  })
  map.on('sourcedata', (event: maplibregl.MapSourceDataEvent) => {
    if (showing && event.tile && event.sourceId === SNOW_SOURCE_ID) deps.popups.refreshPoint('snow')
  })
  return {
    update({ show }) {
      if (show === showing) return
      showing = show
      if (!show) {
        if (map.getLayer(SNOW_LAYER_ID)) map.removeLayer(SNOW_LAYER_ID)
        if (map.getSource(SNOW_SOURCE_ID)) map.removeSource(SNOW_SOURCE_ID)
        // The copies of the tiles the snow was read from go with it, and a
        // section about snow the map no longer draws leaves its card.
        tiles.drop(SNOW_HELD_LAYER)
        asking.abort()
        asking = new AbortController()
        kept.clear()
        deps.popups.refreshPoint('snow')
        return
      }
      const beneath = snowBeneath((id) => Boolean(map.getLayer(id)))
      if (!map.getSource(SNOW_SOURCE_ID)) {
        map.addSource(SNOW_SOURCE_ID, {
          type: 'raster',
          tiles: [SNOW_HELD_URL],
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
