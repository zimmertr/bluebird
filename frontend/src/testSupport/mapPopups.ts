import { vi } from 'vitest'
import { createMapController, type MapController, type MapInputs } from '../map/controller'
import { mountMapPopups } from '../map/mapPopups'
import { createPopupBoard } from '../map/popups'
import type { stubMap, StubFeature } from './stubMap'

// The map's popup system, mounted for real on a stub map, for a module test
// that clicks the targets its module registers. Every popup goes through
// `map/mapPopups.ts`, so a test that clicked a layer's own handler would be
// testing a listener the module no longer has. The test file mocks
// maplibre-gl's Popup as before, because this makes real ones.
export function mountTestPopups(
  stub: ReturnType<typeof stubMap>,
  controller: MapController = createMapController({ drawing: false } as MapInputs),
) {
  const addPoint = vi.fn()
  const popups = mountMapPopups(stub.map, { controller, board: createPopupBoard(), addPoint })
  // A click with these features under it, at this map coordinate.
  const click = (
    under: StubFeature[],
    { lngLat = { lng: -121.5, lat: 47.5 }, shiftKey = false }: { lngLat?: { lng: number; lat: number }; shiftKey?: boolean } = {},
  ) => {
    stub.setUnder(under)
    stub.fire('click', undefined, { point: { x: 0, y: 0 }, lngLat, originalEvent: { shiftKey } })
  }
  return { popups, addPoint, click }
}
