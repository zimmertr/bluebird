/**
 * The map's view, reported to one watcher now and after each settled move
 * (#676), for the Layers menu's coverage test (`hooks/useLayerReach.ts`).
 *
 * A subscription the watcher ends, rather than a listener mounted for the
 * session the way `camera.ts` is: the one reader is the Layers menu, open for
 * seconds at a time, and a `moveend` listener that ran for a closed menu would
 * be a test of six outlines on every pan for nobody. Not on React state, for
 * `camera.ts`'s reason: a view in the map's parent's state would render every
 * memoized child on every pan.
 */
import type * as maplibregl from 'maplibre-gl'
import type { ViewBounds } from '../utils/layerCoverage'

export function watchView(map: maplibregl.Map, onBounds: (bounds: ViewBounds) => void): () => void {
  const report = () => onBounds(map.getBounds())
  report()
  map.on('moveend', report)
  return () => {
    map.off('moveend', report)
  }
}
