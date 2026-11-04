import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POPUP_BODY_ATTR, POPUP_CARD_CLASS } from '../utils/popup/popupChrome'
import { POPUP_PAN_MS } from '../utils/popup/popupFit'

// MapLibre's Popup needs a DOM. This one records the options it was made with
// and whether it is open, and fires `close` when removed, as MapLibre's does.
// Its element and its point are whatever `dom` holds, so a test can stand a
// card of a given size at a given place for `bodyCap`.
const { made, dom } = vi.hoisted(() => ({
  made: [] as { options: Record<string, unknown>; html: string; removed: boolean }[],
  dom: { element: undefined as unknown, lngLat: { lng: -121.5, lat: 47.5 } as { lng: number; lat: number } | undefined },
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state: { options: Record<string, unknown>; html: string; removed: boolean }
    options: Record<string, unknown>
    closers: (() => void)[] = []
    constructor(options: Record<string, unknown>) {
      this.options = options
      this.state = { options, html: '', removed: false }
      made.push(this.state)
    }
    setLngLat() {
      return this
    }
    getLngLat() {
      return dom.lngLat
    }
    setHTML(html: string) {
      this.state.html = html
      return this
    }
    addTo() {
      return this
    }
    getElement() {
      return dom.element
    }
    on(_type: string, fn: () => void) {
      this.closers.push(fn)
      return this
    }
    remove() {
      this.state.removed = true
      for (const fn of this.closers) fn()
    }
  },
}))

import { Popup } from 'maplibre-gl'
import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { mountMapPopups, type MapPointTarget, type MapPopupTarget } from './mapPopups'
import { createPopupBoard, popupOptions } from './popups'
import { stubMap, type StubFeature } from '../testSupport/stubMap'
import type { MapTarget } from '../utils/mapClick'
import type { PointReading, PointSection } from '../utils/pointReadout'

// A card a test stood for `bodyCap` is gone before the next test opens one.
beforeEach(() => {
  dom.element = undefined
  dom.lngLat = { lng: -121.5, lat: 47.5 }
})

const LAYERS = ['fire-fill', 'marker', 'heavy', 'light', 'trail', 'vertices']

function setup({ drawing = false, layers = LAYERS } = {}) {
  made.length = 0
  const stub = stubMap({ layers, canvasWidth: 800 })
  const controller = createMapController(mapInputs({ drawing }))
  const addPoint = vi.fn()
  const board = createPopupBoard()
  const popups = mountMapPopups(stub.map, { controller, board, addPoint })
  // The spot's card as a test sees it: where it was asked to open, and a card
  // there. The real card is `destinationCards.ts`'s.
  const spots: { lng: number; lat: number }[] = []
  popups.registerSpot((at) => {
    spots.push(at)
    popups.openCard(at, 'Spot', {})
  })
  const opened: { target: MapTarget; layer: string }[] = []
  const register = (target: MapTarget, targetLayers: string[], extra: Partial<MapPopupTarget> = {}) =>
    popups.register({
      target,
      layers: targetLayers,
      open: ({ feature }) => {
        opened.push({ target, layer: feature.layer.id })
        popups.openCard([0, 0], target, { owner: target })
      },
      ...extra,
    })
  const under = (...ids: string[]) => stub.setUnder(ids.map((id): StubFeature => ({ layer: { id } })))
  const click = (shiftKey = false) =>
    stub.fire('click', undefined, { point: { x: 10, y: 20 }, lngLat: { lng: -121.5, lat: 47.5 }, originalEvent: { shiftKey } })
  const move = () => stub.fire('mousemove', undefined, { point: { x: 10, y: 20 }, lngLat: { lng: -121.5, lat: 47.5 } })
  return { stub, controller, addPoint, popups, opened, register, under, click, move, spots }
}

describe('mountMapPopups', () => {
  // One click and one pointer listener for the whole map: no layer listens
  // for itself, which is the whole point of the module.
  it('listens once for the whole map, on no layer', () => {
    const { stub, register } = setup()
    register('fire', ['fire-fill'])
    register('result', ['marker'])
    expect(stub.handlerCount('click')).toBe(1)
    expect(stub.handlerCount('mousemove')).toBe(1)
    for (const layer of LAYERS) {
      for (const type of ['click', 'mouseenter', 'mouseleave', 'mousemove']) {
        expect(stub.handlerCount(type, layer)).toBe(0)
      }
    }
  })

  it('opens the highest-ranked target under the click, and only that one', () => {
    const { register, under, click, opened } = setup()
    register('fire', ['fire-fill'])
    register('result', ['marker'])
    under('fire-fill', 'marker')
    click()
    expect(opened).toEqual([{ target: 'result', layer: 'marker' }])
  })

  // Smoke lists its densities heaviest first, so the densest plume is the one
  // described when a click lands on three nested ones.
  it("hands the target the feature from the first of its layers that drew one", () => {
    const { register, under, click, opened } = setup()
    register('smoke', ['heavy', 'light'])
    under('light', 'heavy')
    click()
    expect(opened).toEqual([{ target: 'smoke', layer: 'heavy' }])
  })

  it('asks only about the layers the map has drawn', () => {
    const asked: string[][] = []
    made.length = 0
    const stub = stubMap({
      layers: ['marker'],
      rendered: (_p, o) => (asked.push((o as { layers: string[] }).layers), []),
    })
    const popups = mountMapPopups(stub.map, {
      controller: createMapController(mapInputs()),
      board: createPopupBoard(),
      addPoint: vi.fn(),
    })
    popups.register({ target: 'result', layers: ['marker'], open: vi.fn() })
    popups.register({ target: 'fire', layers: ['fire-fill'], open: vi.fn() })
    stub.fire('click', undefined, { point: { x: 0, y: 0 }, lngLat: { lng: 0, lat: 0 } })
    expect(asked).toEqual([['marker']])
  })

  // A hairline target answers a click near it, in a box its margin wide.
  it('asks about a target with a margin over a box that wide', () => {
    const asked: unknown[] = []
    const stub = stubMap({ layers: ['marker', 'trail'], rendered: (at) => (asked.push(at), []) })
    const popups = mountMapPopups(stub.map, {
      controller: createMapController(mapInputs()),
      board: createPopupBoard(),
      addPoint: vi.fn(),
    })
    popups.register({ target: 'result', layers: ['marker'], open: vi.fn() })
    popups.register({ target: 'closure-trail', layers: ['trail'], slopPx: 6, open: vi.fn() })
    stub.fire('click', undefined, { point: { x: 10, y: 20 }, lngLat: { lng: 0, lat: 0 } })
    expect(asked).toEqual([
      { x: 10, y: 20 },
      [
        [4, 14],
        [16, 26],
      ],
    ])
  })

  it('clears the board on a click, and keeps it on a shift-click', () => {
    const { register, under, click } = setup()
    register('fire', ['fire-fill'])
    under('fire-fill')
    click()
    click()
    expect(made.map((p) => p.removed)).toEqual([true, false])
    click(true)
    expect(made.map((p) => p.removed)).toEqual([true, false, false])
    under()
    click()
    expect(made.every((p) => p.removed)).toBe(true)
  })
})


// A click on bare map is the spot's (#832, TJ 2026-11-03): the same left
// click every marker and label answers.
describe('mountMapPopups bare map', () => {
  it("opens the spot's card where nothing under the click opens", () => {
    const { click, spots } = setup()
    click()
    expect(spots).toEqual([{ lng: -121.5, lat: 47.5 }])
    expect(made).toHaveLength(1)
  })

  // A reader dismissing a card does not get another one for it.
  it('only closes the open cards on a click while any is open', () => {
    const { register, under, click, spots } = setup()
    register('fire', ['fire-fill'])
    under('fire-fill')
    click()
    under()
    click()
    expect(made.map((p) => p.removed)).toEqual([true])
    expect(spots).toEqual([])
    click()
    expect(spots).toHaveLength(1)
  })

  it('opens the spot beside the open cards on a shift-click', () => {
    const { register, under, click, spots } = setup()
    register('fire', ['fire-fill'])
    under('fire-fill')
    click()
    under()
    click(true)
    expect(spots).toHaveLength(1)
    expect(made.map((p) => p.removed)).toEqual([false, false])
  })

  it('opens nothing with no spot card registered', () => {
    made.length = 0
    const stub = stubMap({ layers: LAYERS })
    const popups = mountMapPopups(stub.map, { controller: createMapController(mapInputs()), board: createPopupBoard(), addPoint: vi.fn() })
    stub.fire('click', undefined, { point: { x: 0, y: 0 }, lngLat: { lng: -121.5, lat: 47.5 }, originalEvent: {} })
    popups.openSpot([-121.5, 47.5])
    expect(made).toEqual([])
  })

  // What a fire's perimeter says is a section of the spot's card, so its
  // shape opens that card where it was clicked.
  it("opens the spot at the click from a shape target's own open", () => {
    const { popups, under, click, spots } = setup()
    popups.register({ target: 'fire', layers: ['fire-fill'], open: (hit) => popups.openSpot(hit.lngLat) })
    under('fire-fill')
    click()
    expect(spots).toEqual([{ lng: -121.5, lat: 47.5 }])
    expect(made).toHaveLength(1)
  })

  // A star's coordinates come as GeoJSON's pair, a feature's as `lon`.
  it('opens the spot at a coordinate however it is spelled', () => {
    const { popups, spots } = setup()
    popups.openSpot([-120.25, 46.5])
    popups.openSpot({ lon: -119.75, lat: 45.5 })
    popups.openSpot({ lng: -118.5, lat: 44.25 })
    // A map scrolled past the antimeridian reports a longitude outside
    // -180..180, which the spot's title and its link must not carry.
    popups.openSpot({ lng: 238.5, lat: 47.5 })
    expect(spots).toEqual([
      { lng: -120.25, lat: 46.5 },
      { lng: -119.75, lat: 45.5 },
      { lng: -118.5, lat: 44.25 },
      { lng: -121.5, lat: 47.5 },
    ])
  })

  // The card asks the layers for itself; the click only says where.
  it('reads no point target on a click', () => {
    const { popups, click, spots } = setup()
    const read = vi.fn(async () => null)
    popups.registerPoint({ target: 'radar', shown: () => true, paints: () => true, read })
    click()
    expect(spots).toHaveLength(1)
    expect(read).not.toHaveBeenCalled()
  })

  it('places a point rather than opening the spot while the ring is drawn', () => {
    const { click, addPoint, spots } = setup({ drawing: true })
    click()
    expect(addPoint).toHaveBeenCalledTimes(1)
    expect(spots).toEqual([])
  })
})

describe('mountMapPopups fall-through', () => {
  // A label with no name has nothing to add, so the click is the fire's.
  it('hands the click to the next target when the first opens nothing', () => {
    const { register, under, click, opened, popups } = setup()
    popups.register({ target: 'poi', layers: ['light'], open: () => false })
    register('fire', ['fire-fill'])
    under('light', 'fire-fill')
    click()
    expect(opened).toEqual([{ target: 'fire', layer: 'fire-fill' }])
  })

  it('places a point in draw mode when every target there opens nothing', () => {
    const { under, click, addPoint, popups } = setup({ drawing: true })
    popups.register({ target: 'result', layers: ['marker'], open: () => false })
    under('marker')
    click()
    expect(addPoint).toHaveBeenCalledTimes(1)
  })

  // A midpoint claims its click without opening anything: its mousedown has
  // already placed the point a fall-through would place again.
  it('stops at a target that claims the click without opening anything', () => {
    const { under, click, addPoint, popups } = setup({ drawing: true })
    popups.register({ target: 'vertex', layers: ['vertices'], open: () => undefined })
    under('vertices')
    click()
    expect(addPoint).not.toHaveBeenCalled()
  })
})

describe('mountMapPopups while drawing', () => {
  it('places a point for a click on bare map', () => {
    const { addPoint, click } = setup({ drawing: true })
    click()
    expect(addPoint).toHaveBeenCalledWith([-121.5, 47.5])
  })

  // A ring may be drawn inside a fire (TJ, 2026-10-08).
  it('places a point inside a fire, and opens a marker rather than placing one on it', () => {
    const { register, under, click, addPoint, opened } = setup({ drawing: true })
    register('fire', ['fire-fill'])
    register('result', ['marker'])
    under('fire-fill')
    click()
    expect(addPoint).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([])
    under('fire-fill', 'marker')
    click()
    expect(addPoint).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([{ target: 'result', layer: 'marker' }])
  })
})

describe('mountMapPopups cursor', () => {
  it('points over a target, rests elsewhere, and keeps the crosshair over scenery in draw mode', () => {
    const { stub, register, under, move, controller } = setup()
    register('fire', ['fire-fill'])
    under('fire-fill')
    move()
    expect(stub.canvas.style.cursor).toBe('pointer')
    under()
    move()
    expect(stub.canvas.style.cursor).toBe('')
    controller.update({ ...controller.inputs, drawing: true })
    under('fire-fill')
    move()
    expect(stub.canvas.style.cursor).toBe('crosshair')
  })

  // A move with a button held is a pan: the grabbing hand is MapLibre's, and
  // nothing is asked of the map on every frame of it.
  it('clears its cursor and asks nothing while the map is dragged', () => {
    let asked = 0
    const stub = stubMap({ layers: ['fire-fill'], rendered: () => (asked++, [{ layer: { id: 'fire-fill' } }]) })
    const popups = mountMapPopups(stub.map, {
      controller: createMapController(mapInputs()),
      board: createPopupBoard(),
      addPoint: vi.fn(),
    })
    popups.register({ target: 'fire', layers: ['fire-fill'], open: vi.fn() })
    stub.fire('mousemove', undefined, { point: { x: 0, y: 0 }, originalEvent: { buttons: 0 } })
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mousemove', undefined, { point: { x: 5, y: 0 }, originalEvent: { buttons: 1 } })
    expect(stub.canvas.style.cursor).toBe('')
    expect(asked).toBe(1)
  })

  // A layer can draw things its target refuses: the style's `label_other`
  // labels suburbs beside the hamlets a click takes (#710). A refused feature
  // is not under the cursor at all, for the pointer or for the click.
  it('passes over a feature its target does not accept', () => {
    const { stub, register, click, move, opened } = setup()
    register('poi', ['light'], { accepts: (f) => f.properties?.class === 'hamlet' })
    register('fire', ['fire-fill'])
    const suburb: StubFeature = { layer: { id: 'light' }, properties: { class: 'suburb' } }
    stub.setUnder([suburb])
    move()
    expect(stub.canvas.style.cursor).toBe('')
    stub.setUnder([suburb, { layer: { id: 'fire-fill' } }])
    click()
    expect(opened).toEqual([{ target: 'fire', layer: 'fire-fill' }])
    stub.setUnder([{ layer: { id: 'light' }, properties: { class: 'hamlet' } }])
    move()
    expect(stub.canvas.style.cursor).toBe('pointer')
  })

  it('leaves the cursor alone while a target holds it', () => {
    let held = true
    const { stub, register, under, move } = setup({ drawing: true })
    register('vertex', ['vertices'], { holdsCursor: () => held })
    stub.canvas.style.cursor = 'grabbing'
    under()
    move()
    expect(stub.canvas.style.cursor).toBe('grabbing')
    held = false
    move()
    expect(stub.canvas.style.cursor).toBe('crosshair')
  })
})

describe('mountMapPopups openCard and openBare', () => {
  // Every popup is made the same way: the board's width rule, never
  // closeOnClick, framed as a card unless it is a bare button (#738), and on
  // the board under its owner.
  it('makes every popup with the shared options, on the board under its owner', () => {
    const { stub, popups } = setup()
    popups.openCard([0, 0], '<p>fire</p>', { owner: 'fire' })
    popups.openCard([0, 0], '<p>card</p>', { owner: 'result', result: true })
    popups.openBare([0, 0], '<p>rm</p>', { offset: [0, -8] })
    expect(made.map((p) => p.options)).toEqual([
      { ...popupOptions(stub.map), closeOnClick: false, anchor: 'top', className: POPUP_CARD_CLASS },
      { ...popupOptions(stub.map, { result: true }), closeOnClick: false, anchor: 'top', className: POPUP_CARD_CLASS },
      { ...popupOptions(stub.map), closeOnClick: false, offset: [0, -8], closeButton: false },
    ])
    popups.closeAll('fire')
    expect(made.map((p) => p.removed)).toEqual([true, false, false])
    popups.closeAll()
    expect(made.every((p) => p.removed)).toBe(true)
  })

  // One framework for every card (#738): a fire's card is fitted and panned
  // exactly as a destination's is, where an overlay's used to open wherever
  // it was clicked and could stand under the search pill or the sheet. The
  // owner feeds the board alone, so one owner proves the fit; that every
  // overlay opens through `openCard` is the linter's, which bans `new Popup`
  // anywhere but map/mapPopups.ts.
  it('pans the map to show a card standing over the results sheet', () => {
    const stub = stubMap({ canvasWidth: 800, canvasHeight: 900, markerAt: { x: 400, y: 880 } })
    const controller = createMapController(mapInputs({ cameraPadBottomPx: 500 }))
    const popups = mountMapPopups(stub.map, { controller, board: createPopupBoard(), addPoint: vi.fn() })
    const placed = popups.openCard([0, 0], '<p>card</p>', { owner: 'fire' })
    expect(placed.dy).toBeLessThan(0)
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([
      ['panBy', [0, -placed.dy], { duration: POPUP_PAN_MS }],
    ])
  })

  it('hands the move back instead of panning when asked to', () => {
    const stub = stubMap({ canvasWidth: 800, canvasHeight: 900, markerAt: { x: 400, y: 880 } })
    const controller = createMapController(mapInputs({ cameraPadBottomPx: 500 }))
    const popups = mountMapPopups(stub.map, { controller, board: createPopupBoard(), addPoint: vi.fn() })
    expect(popups.openCard([0, 0], '<p>card</p>', { owner: 'result', pan: false }).dy).toBeLessThan(0)
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([])
  })
})

describe('mountMapPopups point target cursor', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const pointTarget = (target: MapTarget, paints: MapPointTarget['paints'], shown = () => true) => ({
    target,
    shown,
    paints,
    read: async () => null,
  })

  // A pointer over painted pixels says a click there opens something, as
  // over a fire (TJ, 2026-10-16).
  it('points over a picture that painted there, and rests where none did', () => {
    const { stub, popups, move } = setup()
    let painted = true
    popups.registerPoint(pointTarget('snow', () => painted))
    move()
    expect(stub.canvas.style.cursor).toBe('pointer')
    painted = false
    move()
    expect(stub.canvas.style.cursor).toBe('')
  })

  it('points once a tile that was still decoding says it painted, unless the pointer moved on', async () => {
    const { stub, popups, move } = setup()
    let answer: (painted: boolean) => void = () => {}
    let calls = 0
    popups.registerPoint(
      pointTarget('radar', () => (++calls === 1 ? new Promise<boolean>((resolve) => (answer = resolve)) : false)),
    )
    move()
    expect(stub.canvas.style.cursor).toBe('')
    answer(true)
    await settle()
    expect(stub.canvas.style.cursor).toBe('pointer')

    calls = 0
    move()
    move()
    answer(true)
    await settle()
    expect(stub.canvas.style.cursor).toBe('')
  })

  it('asks no picture for a layer switched off', () => {
    const { popups, move } = setup()
    const paints = vi.fn(() => true)
    popups.registerPoint(pointTarget('snow', paints, () => false))
    move()
    expect(paints).not.toHaveBeenCalled()
  })

  it('asks no picture over a shape', () => {
    const { popups, register, under, move } = setup()
    const paints = vi.fn(() => true)
    popups.registerPoint(pointTarget('radar', paints))
    register('fire', ['fire-fill'])
    under('fire-fill')
    move()
    expect(paints).not.toHaveBeenCalled()
  })

  it('asks no picture while drawing and keeps the crosshair', () => {
    const { stub, popups, move, controller } = setup()
    const paints = vi.fn(() => true)
    popups.registerPoint(pointTarget('radar', paints))
    controller.update({ ...controller.inputs, drawing: true })
    move()
    expect(paints).not.toHaveBeenCalled()
    expect(stub.canvas.style.cursor).toBe('crosshair')
  })
})


// Every card asks every layer that is on for its section at the card's point
// (#832), and these are the questions it asks with.
describe('mountMapPopups point targets', () => {
  const section = (kind: MapTarget, title: string): PointSection => ({ kind, layer: 'Layer', title, source: `${title} source`, rows: [] })
  const whole = (kind: MapTarget, title: string): PointReading => ({ section: section(kind, title) })
  const signal = () => new AbortController().signal

  function point(
    popups: ReturnType<typeof setup>['popups'],
    target: MapTarget,
    { shown = (): boolean => true, read = async (): Promise<PointReading | null> => whole(target, target), refresh }: Partial<MapPointTarget> = {},
  ) {
    const spy = vi.fn(read)
    const again = refresh && vi.fn(refresh)
    popups.registerPoint({ target, shown, paints: () => false, read: spy, ...(again && { refresh: again }) })
    return { read: spy, refresh: again }
  }

  // A card's sections stand in rank order whatever order the layers were
  // switched on in.
  it('names the layers that are on, in rank order', () => {
    const { popups } = setup()
    point(popups, 'snow')
    point(popups, 'radar')
    point(popups, 'fire', { shown: () => false })
    point(popups, 'closure-area')
    point(popups, 'fire-activity')
    expect(popups.pointKinds()).toEqual(['fire-activity', 'closure-area', 'radar', 'snow'])
  })

  // A card a reader opened before starting a ring still reads its layers.
  it('names them while the ring is drawn too', () => {
    const { popups } = setup({ drawing: true })
    point(popups, 'smoke')
    expect(popups.pointKinds()).toEqual(['smoke'])
  })

  it('answers null for a layer that is off or was never registered', async () => {
    const { popups } = setup()
    const { read } = point(popups, 'snow', { shown: () => false })
    expect(await popups.readPoint('snow', [-121.5, 47.5], signal())).toBeNull()
    expect(await popups.readPoint('radar', [-121.5, 47.5], signal())).toBeNull()
    expect(read).not.toHaveBeenCalled()
  })

  it("hands the layer the point, its longitude wrapped, the zoom and the card's signal", async () => {
    const { popups } = setup()
    const { read } = point(popups, 'radar')
    const ac = new AbortController()
    expect(await popups.readPoint('radar', { lng: 238.5, lat: 47.5 }, ac.signal)).toEqual(whole('radar', 'radar'))
    await popups.readPoint('radar', [-481.5, 47.5], ac.signal)
    await popups.readPoint('radar', { lon: -121.5, lat: 47.5 }, ac.signal)
    expect(read.mock.calls.map((c) => c[0])).toEqual([
      { lng: -121.5, lat: 47.5, zoom: 8 },
      { lng: -121.5, lat: 47.5, zoom: 8 },
      { lng: -121.5, lat: 47.5, zoom: 8 },
    ])
    expect(read.mock.calls[0][1]).toBe(ac.signal)
  })

  // The radar's frame moved under an open card (#748): it answers with what
  // it shows there now rather than taking its section off.
  it('reads again through refresh only for a card already open, and only where the layer has one', async () => {
    const { popups } = setup()
    const radar = point(popups, 'radar', { refresh: async () => whole('radar', 'No echo') })
    const snow = point(popups, 'snow')
    expect(await popups.readPoint('radar', [-121.5, 47.5], signal())).toEqual(whole('radar', 'radar'))
    expect(radar.refresh).not.toHaveBeenCalled()
    expect(await popups.readPoint('radar', [-121.5, 47.5], signal(), true)).toEqual(whole('radar', 'No echo'))
    expect(radar.read).toHaveBeenCalledTimes(1)
    expect(radar.refresh!.mock.calls[0][0]).toEqual({ lng: -121.5, lat: 47.5, zoom: 8 })
    expect(await popups.readPoint('snow', [-121.5, 47.5], signal(), true)).toEqual(whole('snow', 'snow'))
    expect(snow.read).toHaveBeenCalledTimes(1)
  })

  // A hazard answers from the features it holds, so its section is in the
  // card's first paint rather than a frame after it (#832).
  it('answers at once for a layer that answers at once', () => {
    const { popups } = setup()
    point(popups, 'fire', { read: () => whole('fire', 'Bolt Creek') })
    expect(popups.readPoint('fire', [-121.5, 47.5], signal())).toEqual(whole('fire', 'Bolt Creek'))
    expect(popups.readPoint('smoke', [-121.5, 47.5], signal())).toBeNull()
  })

  // The card warns and carries on without it.
  it('hands a failed reading back as a rejection', async () => {
    const { popups } = setup()
    point(popups, 'snow', {
      read: async () => {
        throw new Error('down')
      },
    })
    await expect(popups.readPoint('snow', [-121.5, 47.5], signal())).rejects.toThrow('down')
  })
})

// A layer's picture or features change under the open cards and a resting
// mouse, and neither a click nor a move comes to say so: the radar's frames
// during playback (#748), a fire layer's fetch landing or the layer going off
// (#832).
describe('mountMapPopups point targets that change', () => {
  it('tells every listener which layer changed', () => {
    const { popups } = setup()
    const heard: MapTarget[][] = [[], []]
    popups.onPointChange((kind) => heard[0].push(kind))
    popups.onPointChange((kind) => heard[1].push(kind))
    popups.refreshPoint('radar')
    popups.refreshPoint('fire')
    expect(heard).toEqual([
      ['radar', 'fire'],
      ['radar', 'fire'],
    ])
  })

  it('tells them whether or not any card is open', () => {
    const { popups } = setup()
    const listen = vi.fn()
    popups.onPointChange(listen)
    popups.refreshPoint('snow')
    expect(made).toEqual([])
    expect(listen).toHaveBeenCalledWith('snow')
  })
})

// A card that grew after it opened, as one does when a layer's section lands
// on it (#832), is capped where it stands rather than moved.
describe('mountMapPopups bodyCap', () => {
  // A card of this height whose body is this tall, standing on this side of
  // a marker at this height on a 600px map, the sheet taking `sheetPx` off it.
  function card({ markerY, height, body, anchor = 'top', sheetPx = 0 }: { markerY: number; height: number; body: number; anchor?: 'top' | 'bottom'; sheetPx?: number }) {
    made.length = 0
    const stub = stubMap({ canvasWidth: 800, canvasHeight: 600 + sheetPx, markerAt: { x: 400, y: markerY } })
    const controller = createMapController(mapInputs({ cameraPadBottomPx: sheetPx }))
    const popups = mountMapPopups(stub.map, { controller, board: createPopupBoard(), addPoint: vi.fn() })
    const bodyEl = { offsetHeight: body }
    dom.lngLat = { lng: -121.5, lat: 47.5 }
    dom.element = {
      offsetWidth: 300,
      offsetHeight: height,
      querySelector: (sel: string) => (sel === `[${POPUP_BODY_ATTR}]` ? bodyEl : null),
    }
    return { popups, popup: new Popup({ anchor }) }
  }

  it('caps nothing where the card has no element, no body or no point', () => {
    const { popups, popup } = card({ markerY: 500, height: 200, body: 180 })
    expect(popups.bodyCap(popup)).not.toBeNull()
    dom.element = undefined
    expect(popups.bodyCap(popup)).toBeNull()
    dom.element = { offsetWidth: 300, offsetHeight: 200, querySelector: () => null }
    expect(popups.bodyCap(popup)).toBeNull()
    const { popups: again, popup: placeless } = card({ markerY: 500, height: 200, body: 180 })
    dom.lngLat = undefined
    expect(again.bodyCap(placeless)).toBeNull()
  })

  it('caps nothing where the card still stands whole', () => {
    const { popups, popup } = card({ markerY: 100, height: 200, body: 180 })
    expect(popups.bodyCap(popup)).toBeNull()
  })

  // Hanging below its marker: the tip's 10px and the card's 200 end at 710,
  // 110 under the sheet's edge at 600, and the fit's 8px breath comes off too.
  it('takes off the body what a card hanging below its point hangs past the sheet', () => {
    const { popups, popup } = card({ markerY: 500, height: 200, body: 180, sheetPx: 300 })
    expect(popups.bodyCap(popup)).toBe(180 - 110 - 8)
  })

  // Ending 4px short of the edge is inside the fit's breath, so it is capped.
  it("keeps the fit's breath from the edge", () => {
    const { popups, popup } = card({ markerY: 386, height: 200, body: 180 })
    expect(popups.bodyCap(popup)).toBe(180 + 4 - 8)
  })

  // Standing above its marker: the card's top is at 150 - 10 - 200 = -60.
  it('takes off the body what a card standing above its point hangs past the top', () => {
    const { popups, popup } = card({ markerY: 150, height: 200, body: 180, anchor: 'bottom' })
    expect(popups.bodyCap(popup)).toBe(180 - 60 - 8)
  })

  // A card near the edge keeps the name of the section that landed.
  it('never caps a body under 48px', () => {
    const { popups, popup } = card({ markerY: 500, height: 200, body: 100 })
    expect(popups.bodyCap(popup)).toBe(48)
  })
})

describe('mountMapPopups cursor under a changing picture', () => {
  function resting() {
    const ctx = setup()
    let painted = true
    ctx.popups.registerPoint({ target: 'radar', shown: () => true, paints: () => painted, read: async () => null })
    return { ...ctx, paint: (on: boolean) => (painted = on) }
  }

  // The pointer follows the frames under a mouse that does not move (TJ,
  // 2026-10-16).
  it('decides the cursor again where the mouse rests', () => {
    const { stub, popups, move, paint } = resting()
    move()
    expect(stub.canvas.style.cursor).toBe('pointer')
    paint(false)
    popups.refreshPoint('radar')
    expect(stub.canvas.style.cursor).toBe('')
    paint(true)
    popups.refreshPoint('radar')
    expect(stub.canvas.style.cursor).toBe('pointer')
  })

  it('leaves the cursor alone once the mouse has left the map, and while it drags', () => {
    const { stub, popups, move, paint } = resting()
    move()
    stub.fire('mouseout', undefined, {})
    paint(false)
    popups.refreshPoint('radar')
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mousemove', undefined, { point: { x: 10, y: 20 }, lngLat: { lng: -121.5, lat: 47.5 }, originalEvent: { buttons: 1 } })
    paint(true)
    popups.refreshPoint('radar')
    expect(stub.canvas.style.cursor).toBe('')
  })
})
