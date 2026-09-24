/**
 * The map camera, reported to the share link each time it settles (#292).
 *
 * One `moveend` listener, which hands the settled centre and zoom to
 * `onCameraMove` with whether the reader moved it (`isReaderMove`). The callback
 * writes the link directly rather than through React state, so a pan renders
 * nothing: a camera in App state would render every memoized child on every
 * `moveend`. It reads the callback off the controller at event time, like
 * every other handler registered on load.
 *
 * It also reports once when it mounts. The opening frame (`frameOpening` in
 * `MapView.tsx`) runs before the features mount, so its `moveend` has no
 * listener yet, and a link that exists must still carry where it now is.
 */
import type * as maplibregl from 'maplibre-gl'
import type { MapController } from './controller'
import { type CameraView, isReaderMove } from '../utils/mapView'

function settled(map: maplibregl.Map): CameraView {
  const { lng, lat } = map.getCenter()
  return { lng, lat, zoom: map.getZoom() }
}

export function mountCamera(map: maplibregl.Map, deps: { controller: MapController }): void {
  const { controller } = deps
  map.on('moveend', (event) => {
    controller.inputs.onCameraMove(settled(map), isReaderMove(event as { originalEvent?: unknown; geolocateSource?: unknown }))
  })
  controller.inputs.onCameraMove(settled(map), false)
}
