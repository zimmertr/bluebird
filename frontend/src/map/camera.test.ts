import { describe, expect, it, vi } from 'vitest'
import { mountCamera } from './camera'
import { createMapController, type MapInputs } from './controller'
import { stubMap } from '../testSupport/stubMap'

function setup() {
  const stub = stubMap({ center: { lng: -121.5, lat: 47.25 }, zoom: 9.5 })
  const onCameraMove = vi.fn()
  mountCamera(stub.map, { controller: createMapController({ onCameraMove } as unknown as MapInputs) })
  return { stub, onCameraMove }
}

describe('mountCamera', () => {
  // The opening frame runs before the features mount, so its own moveend has
  // no listener: the camera it left is reported once, as the app's move.
  it('reports the camera it mounts on, as an app move', () => {
    const { onCameraMove } = setup()
    expect(onCameraMove).toHaveBeenCalledExactlyOnceWith({ lng: -121.5, lat: 47.25, zoom: 9.5 }, false)
  })

  it('reports each settled move, and says whether the reader made it', () => {
    const { stub, onCameraMove } = setup()
    stub.fire('moveend', undefined, {})
    stub.fire('moveend', undefined, { originalEvent: { type: 'mouseup' } })
    stub.fire('moveend', undefined, { geolocateSource: true })
    expect(onCameraMove.mock.calls.slice(1).map((call) => call[1])).toEqual([false, true, true])
    expect(stub.handlerCount('moveend')).toBe(1)
  })
})
