import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says and whether it is
// open, keeps the one button a POI popup carries, and fires `close` when
// removed, as MapLibre's does. Hoisted, because `vi.mock` runs before the
// imports.
const { popups, outlines } = vi.hoisted(() => ({
  popups: [] as { html: string; removed: boolean; press: () => void }[],
  // The state outlines as the loader holds them, and what its fetch resolves.
  outlines: {
    held: null as import('../utils/usStates').UsStates | null,
    load: null as null | ((states: import('../utils/usStates').UsStates) => void),
    calls: 0,
  },
}))
vi.mock('../utils/usStatesLoad', () => ({
  usStatesNow: () => outlines.held,
  loadUsStates: () => {
    outlines.calls++
    return new Promise((resolve) => {
      outlines.load = (states) => {
        outlines.held = states
        resolve(states)
      }
    })
  },
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
    isOpen() {
      return !this.state.removed
    }
    remove() {
      this.state.removed = true
      for (const fn of this.closers) fn()
    }
    getElement() {
      return {
        // The library's content box, which takes the app's card (POPUP_FACE),
        // and otherwise the one button a popup arms.
        querySelector: (selector: string) =>
          selector === '.maplibregl-popup-content'
            ? { classList: { add: () => {} } }
            : {
                addEventListener: (_type: string, fn: () => void) => {
                  this.state.press = fn
                },
              },
      }
    }
  },
}))

import { mountPoiPopups } from './poiPopup'
import type { GroundReadings } from './groundReadings'
import type { GroundState } from '../utils/popup/groundFact'
import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { RESULT_MARKER_LAYER } from './resultsLayer'
import { mountTestPopups } from '../testSupport/mapPopups'
import { POI_LAYERS, poiFromFeature, poiToPlace } from '../utils/basemapPoi'
import { poiPopupHtml } from '../utils/poiPopup'
import type { Place } from '../utils/geocode'
import { stubMap } from '../testSupport/stubMap'
import stateOutlines from '../utils/usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from '../utils/usStates'

const PEAK_LAYER = 'ofm-peaks'
const SUMMIT: [number, number] = [-121.76, 46.85]
const PEAK_PROPS = { name: 'Mount Rainier', ele: 4392 }
const PEAK = poiFromFeature(PEAK_LAYER, PEAK_PROPS, SUMMIT)!

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
  outlines.held = null
  outlines.load = null
  outlines.calls = 0
})
afterEach(() => {
  vi.useRealTimers()
})

function setup({
  drawing = false,
  searchedPlaces = [] as Place[],
  glow = true,
  landmarks = undefined as { pointOf: (osmId: string) => [number, number] | null } | undefined,
  ground = undefined as GroundReadings | undefined,
} = {}) {
  const stub = stubMap({
    zoom: MAP_ZOOM,
    layers: glow ? [...POI_LAYERS, ...POI_LAYERS.map((id) => `${id}-glow`)] : [...POI_LAYERS],
  })
  const inputs = mapInputs({ drawing, searchedPlaces, onAddPoi: vi.fn(), onRemovePoi: vi.fn(), onRemoveResult: vi.fn() })
  const controller = createMapController(inputs)
  const { popups: mapPopups, click } = mountTestPopups(stub, controller)
  const pois = mountPoiPopups(stub.map, { controller, popups: mapPopups, landmarks, ground })
  // A click on the summit, with whatever else is drawn there under it.
  const peakClick = (shiftKey = false, also: { layer: { id: string } }[] = []) =>
    click([{ layer: { id: PEAK_LAYER }, geometry: { type: 'Point', coordinates: SUMMIT }, properties: PEAK_PROPS }, ...also], {
      lngLat: { lng: SUMMIT[0], lat: SUMMIT[1] },
      shiftKey,
    })
  return { stub, pois, inputs, peakClick, mapPopups, click }
}

// The map's zoom when a card is drawn, which its CalTopo link carries (#712).
const MAP_ZOOM = 13

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
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, false, MAP_ZOOM))

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(poiToPlace(PEAK))
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, true, MAP_ZOOM))

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onRemovePoi).toHaveBeenCalledWith(PEAK.lat, PEAK.lon)
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, false, MAP_ZOOM))
  })

  it('knows a peak the session already holds', () => {
    const { peakClick } = setup({ searchedPlaces: [poiToPlace(PEAK)] })
    peakClick()
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, true, MAP_ZOOM))
  })

  // While drawing a label is scenery.
  it('opens nothing while drawing', () => {
    setup({ drawing: true }).peakClick()
    expect(popups).toHaveLength(0)
  })

  // A marker on an analyzed summit outranks the label under it
  // (`utils/mapClick.ts`).
  it('lets a marker over a label take the click', () => {
    const marked = setup()
    marked.stub.map.addLayer({ id: RESULT_MARKER_LAYER } as never)
    const markerOpened = vi.fn()
    marked.mapPopups.register({ target: 'result', layers: [RESULT_MARKER_LAYER], open: markerOpened })
    marked.peakClick(false, [{ layer: { id: RESULT_MARKER_LAYER } }])
    expect(popups).toHaveLength(0)
    expect(markerOpened).toHaveBeenCalledTimes(1)
  })

  // The style's own place labels (#710): a town opens the same card at the
  // label's point, and a suburb on the same `label_other` opens nothing.
  it('offers a clicked town, and passes over a suburb', () => {
    const NORTH_BEND: [number, number] = [-121.7868, 47.4957]
    const town = { name: 'North Bend', class: 'town', rank: 11 }
    const { click } = setup()
    const placeClick = (layer: string, properties: Record<string, unknown>) =>
      click([{ layer: { id: layer }, geometry: { type: 'Point', coordinates: NORTH_BEND }, properties }], {
        lngLat: { lng: -121.78, lat: 47.49 },
      })
    placeClick('label_town', town)
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(poiPopupHtml(poiFromFeature('label_town', town, NORTH_BEND)!, false, MAP_ZOOM))
    placeClick('label_other', { name: 'Capitol Hill', class: 'suburb' })
    expect(popups).toHaveLength(1)
  })

  // The pod's trailheads (#734): the card a peak opens, at the marker's
  // point, carrying the OSM id into the place it adds.
  it('offers a clicked trailhead with its OSM object', () => {
    const MAILBOX: [number, number] = [-121.7437, 47.4875]
    const props = { name: 'Mailbox Peak Trailhead', kind: 'trailhead', osm_id: 'node/4578891234', elevation_ft: null }
    const { click, inputs } = setup()
    click([{ layer: { id: 'landmark-trailheads' }, geometry: { type: 'Point', coordinates: MAILBOX }, properties: props }], {
      lngLat: { lng: -121.74, lat: 47.48 },
    })
    const poi = poiFromFeature('landmark-trailheads', props, MAILBOX)!
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(poiPopupHtml(poi, false, MAP_ZOOM))
    expect(popups[0].html).toContain('openstreetmap.org/node/4578891234')
    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(expect.objectContaining({ osmId: 'node/4578891234', lat: 47.4875 }))
  })

  // A GeoJSON source is tiled, so the drawn point is snapped to the tile
  // grid; the pod merges a clicked place into a polygon's row by coordinate
  // alone, so the card and the place take the point the layer fetched.
  it('anchors a clicked crag at the exact point the layer fetched, not the drawn one', () => {
    const EXACT: [number, number] = [-121.5555, 47.8208]
    const DRAWN: [number, number] = [-121.55552, 47.82078]
    const props = { name: 'Lower Town Wall', kind: 'crag', osm_id: 'relation/1234', elevation_ft: null }
    const { click, inputs } = setup({ landmarks: { pointOf: (id) => (id === 'relation/1234' ? EXACT : null) } })
    click([{ layer: { id: 'landmark-crags' }, geometry: { type: 'Point', coordinates: DRAWN }, properties: props }], {
      lngLat: { lng: DRAWN[0], lat: DRAWN[1] },
    })
    expect(popups[0].html).toBe(poiPopupHtml(poiFromFeature('landmark-crags', props, EXACT)!, false, MAP_ZOOM))
    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(expect.objectContaining({ lon: EXACT[0], lat: EXACT[1] }))
    // A marker the layer no longer holds keeps the drawn point rather than opening nothing.
    click([{ layer: { id: 'landmark-crags' }, geometry: { type: 'Point', coordinates: DRAWN }, properties: { ...props, osm_id: 'way/9' } }], {
      lngLat: { lng: DRAWN[0], lat: DRAWN[1] },
    })
    expect(popups[1].html).toBe(poiPopupHtml(poiFromFeature('landmark-crags', { ...props, osm_id: 'way/9' }, DRAWN)!, false, MAP_ZOOM))
  })

  // A crag's search names its state from outlines the markers asked for when
  // the crag came into view; a card opened before they land draws again then.
  it("redraws an open crag's card with its state once the outlines land, and asks nothing for a peak", async () => {
    const props = { name: 'Family Wall', kind: 'crag', osm_id: 'way/1307110189', elevation_ft: null }
    const at: [number, number] = [-121.75024, 47.48886]
    const { click, peakClick } = setup()
    peakClick()
    expect(outlines.calls).toBe(0)
    click([{ layer: { id: 'landmark-crags' }, geometry: { type: 'Point', coordinates: at }, properties: props }], {
      lngLat: { lng: at[0], lat: at[1] },
    })
    const card = popups[popups.length - 1]
    expect(card.html).toContain('search?q=Family%20Wall"')
    expect(outlines.calls).toBe(1)
    outlines.load!(decodeUsStates(stateOutlines as UsStateOutlines))
    await vi.runAllTimersAsync()
    expect(card.html).toContain('search?q=Family%20Wall%20Washington"')
    // The redraw re-arms the button it replaced.
    card.press()
  })

  it('replaces the open popup on a click and keeps it on a shift-click', () => {
    const { peakClick } = setup()
    peakClick()
    peakClick(true)
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    peakClick()
    expect(popups.map((p) => p.removed)).toEqual([true, true, false])
  })

  // The ground under the place lands after the card opens (#832).
  it('draws the slope when its read lands, and holds the credit while open', () => {
    let state: GroundState = { kind: 'pending' }
    const redraws: (() => void)[] = []
    const release = vi.fn()
    const ground: GroundReadings = { at: () => state, onRead: (r) => redraws.push(r), hold: vi.fn(() => release) }
    const { peakClick } = setup({ ground })
    peakClick()
    expect(ground.hold).toHaveBeenCalledOnce()
    state = { kind: 'read', reading: { elevationM: 2198, degrees: 33.1, aspect: 315 } }
    for (const redraw of redraws) redraw()
    expect(popups[0].html).toBe(poiPopupHtml(PEAK, false, MAP_ZOOM, null, state))
    peakClick()
    expect(release).toHaveBeenCalledOnce()
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
