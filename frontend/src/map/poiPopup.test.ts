import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says and whether it is
// open, keeps the one button a POI popup carries, and fires `close` when
// removed, as MapLibre's does. Hoisted, because `vi.mock` runs before the
// imports.
const { popups } = vi.hoisted(() => ({
  popups: [] as { html: string; removed: boolean; press: () => void }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state = { html: '', removed: false, press: () => {} }
    closers: (() => void)[] = []
    constructor() {
      popups.push(this.state)
    }
    setLngLat() {
      return this
    }
    setHTML(html: string) {
      this.state.html = html
      return this
    }
    addTo() {
      return this
    }
    on(_type: string, fn: () => void) {
      this.closers.push(fn)
      return this
    }
    remove() {
      this.state.removed = true
      for (const fn of this.closers) fn()
    }
    getElement() {
      return {
        querySelector: () => ({
          addEventListener: (_type: string, fn: () => void) => {
            this.state.press = fn
          },
        }),
      }
    }
  },
}))

import { mountPoiPopups } from './poiPopup'
import { createMapController, type MapInputs } from './controller'
import { createPopupBoard } from './popups'
import { POI_LAYERS, poiFromFeature, poiToPlace } from '../utils/basemapPoi'
import { poiPopupHtml } from '../utils/poiPopup'
import type { Place } from '../utils/geocode'
import { stubMap } from '../testSupport/stubMap'

const PEAK_LAYER = 'ofm-peaks'
const SUMMIT: [number, number] = [-121.76, 46.85]
const PEAK_PROPS = { name: 'Mount Rainier', ele: 4392 }
const PEAK = poiFromFeature(PEAK_LAYER, PEAK_PROPS, SUMMIT)!

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
})
afterEach(() => {
  vi.useRealTimers()
})

function setup({
  drawing = false,
  searchedPlaces = [] as Place[],
  claimed = false,
  glow = true,
} = {}) {
  const stub = stubMap({
    layers: glow ? [...POI_LAYERS, ...POI_LAYERS.map((id) => `${id}-glow`)] : [...POI_LAYERS],
    // What else is drawn under the click: a marker or a fire perimeter, which
    // wins the click over the basemap label beneath it.
    rendered: () => (claimed ? [{ layer: { id: 'results-circles' } }] : []),
  })
  const inputs: MapInputs = {
    drawing,
    results: [],
    modelId: null,
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    fireWarnings: new Map(),
    searchedPlaces,
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    cameraPadBottomPx: 0,
  }
  const controller = createMapController(inputs)
  const restCursor = vi.fn()
  const pois = mountPoiPopups(stub.map, { controller, popups: createPopupBoard(), restCursor })
  return { stub, pois, inputs, restCursor }
}

function peakClick(shiftKey = false) {
  return {
    originalEvent: { shiftKey },
    point: { x: 0, y: 0 },
    lngLat: { lng: SUMMIT[0], lat: SUMMIT[1] },
    features: [{ geometry: { type: 'Point', coordinates: SUMMIT }, properties: PEAK_PROPS }],
  }
}

describe('mountPoiPopups', () => {
  it('listens for a click and the cursor on every clickable basemap layer', () => {
    const { stub } = setup()
    for (const layer of POI_LAYERS) {
      for (const type of ['click', 'mouseenter', 'mouseleave']) {
        expect(stub.handlerCount(type, layer), `${type} on ${layer}`).toBe(1)
      }
    }
  })

  it('offers to add a clicked peak, and then to take it back out', () => {
    const { stub, inputs } = setup()
    stub.fire('click', PEAK_LAYER, peakClick())
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, false))

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(poiToPlace(PEAK))
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, true))

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onRemovePoi).toHaveBeenCalledWith(PEAK.lat, PEAK.lon)
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, false))
  })

  it('knows a peak the session already holds', () => {
    const { stub } = setup({ searchedPlaces: [poiToPlace(PEAK)] })
    stub.fire('click', PEAK_LAYER, peakClick())
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, true))
  })

  it('opens nothing while drawing, or where a marker or a fire takes the click', () => {
    setup({ drawing: true }).stub.fire('click', PEAK_LAYER, peakClick())
    setup({ claimed: true }).stub.fire('click', PEAK_LAYER, peakClick())
    expect(popups).toHaveLength(0)
  })

  it('replaces the open popup on a click and keeps it on a shift-click', () => {
    const { stub } = setup()
    stub.fire('click', PEAK_LAYER, peakClick())
    stub.fire('click', PEAK_LAYER, peakClick(true))
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    stub.fire('click', PEAK_LAYER, peakClick())
    expect(popups.map((p) => p.removed)).toEqual([true, true, false])
  })

  it('points over a peak outside draw mode and hands the cursor back on leaving', () => {
    const { stub, restCursor } = setup()
    stub.fire('mouseenter', PEAK_LAYER)
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mouseleave', PEAK_LAYER)
    expect(restCursor).toHaveBeenCalledTimes(1)

    const drawing = setup({ drawing: true })
    drawing.stub.fire('mouseenter', PEAK_LAYER)
    expect(drawing.stub.canvas.style.cursor).toBe('')
  })

  it('lights every glow while the panel points at them, and skips a missing one', () => {
    const { stub, pois } = setup()
    pois.setPointed(true)
    for (const id of POI_LAYERS) expect(stub.layout[`${id}-glow`].visibility).toBe('visible')
    pois.setPointed(false)
    for (const id of POI_LAYERS) expect(stub.layout[`${id}-glow`].visibility).toBe('none')

    const bare = setup({ glow: false })
    bare.pois.setPointed(true)
    expect(bare.stub.calls.some((c) => c[0] === 'setLayoutProperty')).toBe(false)
  })
})
