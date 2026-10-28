import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM, and no popup opens here. Hoisted, because
// `vi.mock` runs before the imports.
vi.mock('maplibre-gl', () => ({ Popup: class {}, addProtocol: vi.fn() }))

import { mountFeatures } from './features'
import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { createPopupBoard } from './popups'
import { RESULT_MARKER_LAYER } from './resultsLayer'
import { POI_LAYERS } from '../utils/basemapPoi'
import { stubMap } from '../testSupport/stubMap'

// The node project has no DOM. A canvas with no 2D context is what a browser
// without one hands back, and the image builders survive it.
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const STYLE_LAYERS = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'road_label', type: 'symbol' },
]

function setup(drawing = false) {
  const stub = stubMap({ styleLayers: STYLE_LAYERS })
  const controller = createMapController(mapInputs({ drawing, onCameraMove: vi.fn() }))
  const features = mountFeatures(stub.map, {
    controller,
    popups: createPopupBoard(),
    ring: { current: [] },
    onPolygonChange: vi.fn(),
    onDrawUpdate: vi.fn(),
  })
  return { stub, features }
}

describe('mountFeatures', () => {
  // The order the layers go on in is the order they draw in, so this is the
  // whole stack in one list: the basemap patch and the trailhead and crag
  // markers over it under the style's labels, then the grid, smoke, fire,
  // closures, detections, ring, markers and pending dots above the style.
  it('stacks every feature, lowest first', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      'background',
      'water',
      'ofm-trails-casing',
      'ofm-trails',
      'ofm-peaks-glow',
      'ofm-peaks',
      'ofm-lakes-glow',
      'ofm-lakes',
      'ofm-lakes-line-glow',
      'ofm-lakes-line',
      'landmark-trailheads-glow',
      'landmark-trailheads',
      'landmark-crags-glow',
      'landmark-crags',
      'road_label',
      'forecast-grid-fill',
      'forecast-grid-wind',
      'smoke-fill-Light',
      'smoke-fill-Medium',
      'smoke-fill-Heavy',
      'smoke-outline',
      'wildfire-fill',
      'wildfire-outline',
      'closure-area-fill',
      'closure-area-outline',
      'closure-trail-line',
      'closure-trail-site',
      'fire-activity-points',
      'draw-fill',
      'draw-line',
      'draw-midpoints',
      'draw-vertices',
      'results-halo',
      RESULT_MARKER_LAYER,
      'results-wind',
      'results-rank',
      'results-labels',
      'pending-destinations-halo',
      'pending-destinations-circles',
      'pending-destinations-labels',
    ])
  })

  // The imagery adds nothing on load, and switched on it goes directly above
  // the style's background, under the style's every other layer and so under
  // every feature the app adds (#799).
  it('puts the satellite imagery under everything but the background', () => {
    const { stub, features } = setup()
    const before = [...stub.stack]
    features.imagery.update({ show: true })
    expect(stub.stack).toEqual(['background', 'imagery-eox', 'imagery-usgs', ...before.slice(1)])
  })

  // Every popup opens through map/mapPopups.ts: one click and one pointer
  // listener for the whole map, and none on any layer (TJ, 2026-10-08).
  it('listens for the click and the pointer once, for the whole map, and on no layer', () => {
    const { stub } = setup()
    expect(stub.handlerCount('click')).toBe(1)
    expect(stub.handlerCount('mousemove')).toBe(1)
    for (const layer of [...stub.stack, ...POI_LAYERS, RESULT_MARKER_LAYER]) {
      for (const type of ['click', 'mouseenter', 'mouseleave', 'mousemove']) {
        expect(stub.handlerCount(type, layer), `${type} on ${layer}`).toBe(0)
      }
    }
  })

  it('rests the cursor on the draw-mode rule', () => {
    expect(setup(true).stub.canvas.style.cursor).toBe('crosshair')
    expect(setup(false).stub.canvas.style.cursor).toBe('')
  })

  it('hands back every feature the component drives', () => {
    const { features } = setup()
    expect(Object.keys(features).sort()).toEqual(
      [
        'areaClosures',
        'drawRing',
        'fireActivity',
        'grid',
        'imagery',
        'landmarks',
        'pois',
        'radar',
        'results',
        'smoke',
        'snow',
        'terrain',
        'trailClosures',
        'wildfires',
      ].sort(),
    )
  })

  // The ground waits for a switch (#799): the cold load adds no elevation
  // source, no relief and no contours.
  it('adds nothing of the ground until a switch asks for it', () => {
    const { stub } = setup()
    const added = stub.calls.filter((c) => c[0] === 'addSource').map((c) => c[1])
    expect(added.filter((id) => /dem|contour/.test(String(id)))).toEqual([])
    expect(stub.stack.filter((id) => /relief|contour/.test(id))).toEqual([])
  })
})
