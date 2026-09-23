import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM, and no popup opens here. Hoisted, because
// `vi.mock` runs before the imports.
vi.mock('maplibre-gl', () => ({ Popup: class {} }))

import { mountFeatures } from './features'
import { createMapController, type MapInputs } from './controller'
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
  const controller = createMapController({ drawing } as MapInputs)
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
  // whole stack in one list: the basemap patch under the style's labels, then
  // the grid, smoke, fire, ring, markers and pending dots above the style.
  it('stacks every feature, lowest first', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      'background',
      'water',
      'ofm-trails',
      'ofm-peaks-glow',
      'ofm-peaks',
      'ofm-lakes-glow',
      'ofm-lakes',
      'ofm-lakes-line-glow',
      'ofm-lakes-line',
      'road_label',
      'forecast-grid-fill',
      'forecast-grid-wind',
      'smoke-fill-Light',
      'smoke-fill-Medium',
      'smoke-fill-Heavy',
      'smoke-outline',
      'wildfire-fill',
      'wildfire-outline',
      'draw-fill',
      'draw-line',
      'draw-midpoints',
      'draw-vertices',
      RESULT_MARKER_LAYER,
      'results-wind',
      'results-rank',
      'results-labels',
      'pending-destinations-circles',
      'pending-destinations-labels',
    ])
  })

  it('wires the marker and label clicks before the one click for the whole map', () => {
    const { stub } = setup()
    expect(stub.handlerCount('click', RESULT_MARKER_LAYER)).toBe(1)
    for (const layer of POI_LAYERS) expect(stub.handlerCount('click', layer)).toBe(1)
    expect(stub.handlerCount('click')).toBe(1)
  })

  it('rests the cursor on the draw-mode rule', () => {
    expect(setup(true).stub.canvas.style.cursor).toBe('crosshair')
    expect(setup(false).stub.canvas.style.cursor).toBe('')
  })

  it('hands back every feature the component drives', () => {
    const { features } = setup()
    expect(Object.keys(features).sort()).toEqual(
      ['drawRing', 'grid', 'pois', 'radar', 'results', 'smoke', 'snow', 'wildfires'].sort(),
    )
  })
})
