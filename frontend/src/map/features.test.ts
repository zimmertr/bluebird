import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM, and no popup opens here. Hoisted, because
// `vi.mock` runs before the imports.
vi.mock('maplibre-gl', () => ({ Popup: class {}, addProtocol: vi.fn() }))

import { mountFeatures } from './features'
import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { createPopupBoard } from './popups'
import { CREDIT_LAYER } from './terrain'
import { RESULT_MARKER_LAYER } from './resultsLayer'
import { POI_LAYERS } from '../utils/basemapPoi'
import { radarLayerId, radarOffsets } from '../utils/radar'
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
  // Every layer goes in at its slot in `layerOrder.ts`, whatever order the
  // features mount in, so this is the whole stack in one list: the ground, the
  // trails, the overlays, every name, then the ring, the pending dots and the
  // markers. This style's `water` names no source of Liberty's, so it stands
  // over where the imagery would go, with the roads.
  it('stacks every feature, lowest first', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      'background',
      'water',
      // The empty layer carrying Mapterhorn's credit, from the map's load (#832).
      CREDIT_LAYER,
      'ofm-trails-casing',
      'ofm-trails',
      'forecast-grid-fill',
      'smoke-fill-Light',
      'smoke-fill-Medium',
      'smoke-fill-Heavy',
      'smoke-outline',
      'closure-area-fill',
      'closure-area-outline',
      'wildfire-fill',
      'wildfire-outline',
      'closure-trail-line',
      'closure-trail-site',
      'forecast-grid-wind',
      'fire-activity-points',
      'ofm-peaks-glow',
      'ofm-peaks',
      'ofm-lakes-glow',
      'ofm-lakes',
      'ofm-lakes-line-glow',
      'ofm-lakes-line',
      'road_label',
      'landmark-trailheads-glow',
      'landmark-trailheads',
      'landmark-crags-glow',
      'landmark-crags',
      'draw-fill',
      'draw-line',
      'draw-midpoints',
      'draw-vertices',
      'pending-destinations-halo',
      'pending-destinations-circles',
      'pending-destinations-labels',
      'results-halo',
      RESULT_MARKER_LAYER,
      'results-wind',
      'results-rank',
      'results-labels',
    ])
  })

  // The radar and the snow go on when they are switched on, last of all, and
  // still land in their slots: under the smoke and over the grid, the snow
  // under the rain whichever comes first (record 0268).
  it('puts the radar and the snow in their slots when they are switched on', () => {
    const { stub, features } = setup()
    features.radar.update({ show: true, index: 0 })
    // The warm-up's timer, which this test has no use for.
    features.radar.dispose()
    features.snow.update({ show: true })
    const at = stub.stack.indexOf('forecast-grid-fill')
    expect(stub.stack.slice(at, at + 9)).toEqual([
      'forecast-grid-fill',
      'snow-depth-fill',
      ...radarOffsets().map(radarLayerId),
      'smoke-fill-Light',
    ])
  })

  // The imagery adds nothing on load, and switched on it goes over the
  // style's ground and under its first layer that is not ground, and so under
  // every feature the app adds (#799, record 0250). This style's ground is its
  // background alone: its `water` names no source of Liberty's.
  it('puts the satellite imagery over the ground and under every feature', () => {
    const { stub, features } = setup()
    const before = [...stub.stack]
    features.imagery.update({ show: true, opacity: 0.5 })
    expect(stub.stack).toEqual(['background', 'imagery-eox', 'imagery-usgs', ...before.slice(1)])
  })

  // The Satellite row turns the contours to their imagery ink and back
  // (`terrain.ts`), through the one switch the component drives, and so does
  // its level across a half, where the photos stop being the ground that
  // shows most (record 0250).
  it('hands the Satellite row and its level to the contours as well as the photos', () => {
    const { features } = setup()
    const overImagery = vi.spyOn(features.terrain, 'overImagery')
    features.imagery.update({ show: true, opacity: 0.5 })
    features.imagery.update({ show: true, opacity: 0.45 })
    features.imagery.update({ show: true, opacity: 1 })
    features.imagery.update({ show: false, opacity: 1 })
    expect(overImagery.mock.calls).toEqual([[true], [false], [true], [false]])
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
