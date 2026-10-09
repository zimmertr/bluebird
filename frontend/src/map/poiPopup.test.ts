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
import { RESULT_MARKER_LAYER } from './resultsLayer'
import { mountTestPopups } from '../testSupport/mapPopups'
import { POI_LAYERS, poiFromFeature, poiToPlace } from '../utils/basemapPoi'
import { poiPopupHtml } from '../utils/poiPopup'
import type { Place } from '../utils/geocode'
import { stubMap } from '../testSupport/stubMap'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'

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
  glow = true,
} = {}) {
  const stub = stubMap({
    layers: glow ? [...POI_LAYERS, ...POI_LAYERS.map((id) => `${id}-glow`)] : [...POI_LAYERS],
  })
  const inputs: MapInputs = {
    drawing,
    results: [],
    modelId: null,
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    sortBy: 'aqi_avg',
    fireWarnings: new Map(),
    closureWarnings: new Map(),
    searchedPlaces,
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    cameraPadBottomPx: 0,
    onCameraMove: () => {},
    maxPolygonPoints: MAX_POLYGON_POINTS,
  }
  const controller = createMapController(inputs)
  const { popups: mapPopups, click } = mountTestPopups(stub, controller)
  const pois = mountPoiPopups(stub.map, { controller, popups: mapPopups })
  // A click on the summit, with whatever else is drawn there under it.
  const peakClick = (shiftKey = false, also: { layer: { id: string } }[] = []) =>
    click([{ layer: { id: PEAK_LAYER }, geometry: { type: 'Point', coordinates: SUMMIT }, properties: PEAK_PROPS }, ...also], {
      lngLat: { lng: SUMMIT[0], lat: SUMMIT[1] },
      shiftKey,
    })
  return { stub, pois, inputs, peakClick, mapPopups }
}

describe('mountPoiPopups', () => {
  // The click and the cursor are the map's popup system's (`map/mapPopups.ts`).
  it('listens on no layer of its own', () => {
    const { stub } = setup()
    for (const layer of POI_LAYERS) {
      for (const type of ['click', 'mouseenter', 'mouseleave']) {
        expect(stub.handlerCount(type, layer), `${type} on ${layer}`).toBe(0)
      }
    }
  })

  it('offers to add a clicked peak, and then to take it back out', () => {
    const { inputs, peakClick } = setup()
    peakClick()
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
    const { peakClick } = setup({ searchedPlaces: [poiToPlace(PEAK)] })
    peakClick()
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, true))
  })

  // A marker on an analyzed summit outranks the label under it
  // (`utils/mapClick.ts`), and while drawing a label is scenery.
  it('opens nothing while drawing, or where a marker takes the click', () => {
    setup({ drawing: true }).peakClick()
    const marked = setup()
    marked.stub.map.addLayer({ id: RESULT_MARKER_LAYER } as never)
    const markerOpened = vi.fn()
    marked.mapPopups.register({ target: 'result', layers: [RESULT_MARKER_LAYER], open: markerOpened })
    marked.peakClick(false, [{ layer: { id: RESULT_MARKER_LAYER } }])
    expect(popups).toHaveLength(0)
    expect(markerOpened).toHaveBeenCalledTimes(1)
  })

  it('replaces the open popup on a click and keeps it on a shift-click', () => {
    const { peakClick } = setup()
    peakClick()
    peakClick(true)
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    peakClick()
    expect(popups.map((p) => p.removed)).toEqual([true, true, false])
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
