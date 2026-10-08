import { useEffect, useState, type RefObject } from 'react'
import {
  type BoundedLayer,
  type LayerCoverage,
  type ViewBounds,
  layersOutOfView,
  sameLayers,
} from '../utils/layerCoverage'

// Which Layers rows have nothing to draw over the map's current view, read
// while the menu is open and not otherwise. The menu is the only reader, and
// it is open for seconds at a time, so the map's bounds are watched for
// exactly that long: the test runs once when the menu opens and once per
// settled move after, and a closed menu costs a pan nothing. The answer is
// a set compared by its members, so a settled move that changed no row
// renders no row.

const NONE: ReadonlySet<BoundedLayer> = new Set()

/**
 * @param mapRef the map, whose `watchBounds` reports the view; null before it mounts
 * @param coverage the server's outlines for the three snapshot layers
 * @param active whether the menu is open, which is when the view is watched
 */
export function useLayerReach(
  mapRef: RefObject<{ watchBounds: (onBounds: (bounds: ViewBounds) => void) => () => void } | null>,
  coverage: LayerCoverage,
  active: boolean,
): ReadonlySet<BoundedLayer> {
  const [out, setOut] = useState<ReadonlySet<BoundedLayer>>(NONE)

  useEffect(() => {
    if (!active) return
    const map = mapRef.current
    if (!map) return
    return map.watchBounds((bounds) => {
      const next = layersOutOfView(bounds, coverage)
      setOut((prev) => (sameLayers(prev, next) ? prev : next))
    })
  }, [active, coverage, mapRef])

  return active ? out : NONE
}
