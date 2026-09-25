import type * as maplibregl from 'maplibre-gl'

/**
 * Resolves once the map has loaded, stopped moving and drawn its tiles: at
 * once when it already has, or on its next `idle`.
 *
 * The tutorial (#536) waits on it before it clicks a label or places a ring
 * corner on its demo map, since a point projected mid-flight lands wherever
 * the camera was passing.
 */
export function mapIdle(map: maplibregl.Map, loaded: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (loaded && !map.isMoving() && map.areTilesLoaded()) resolve()
    else map.once('idle', () => resolve())
  })
}
