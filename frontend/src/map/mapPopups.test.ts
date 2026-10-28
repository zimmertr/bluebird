import { describe, expect, it, vi } from 'vitest'
import { POPUP_CARD_CLASS } from '../utils/popup/popupChrome'
import { POPUP_PAN_MS } from '../utils/popup/popupFit'

// MapLibre's Popup needs a DOM. This one records the options it was made with
// and whether it is open, and fires `close` when removed, as MapLibre's does.
const { made } = vi.hoisted(() => ({
  made: [] as { options: Record<string, unknown>; html: string; removed: boolean }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state: { options: Record<string, unknown>; html: string; removed: boolean }
    closers: (() => void)[] = []
    constructor(options: Record<string, unknown>) {
      this.state = { options, html: '', removed: false }
      made.push(this.state)
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
    getElement() {
      return undefined
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

import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { mountMapPopups, type MapPointTarget, type MapPopupTarget } from './mapPopups'
import { createPopupBoard, popupOptions } from './popups'
import { stubMap, type StubFeature } from '../testSupport/stubMap'
import type { MapTarget } from '../utils/mapClick'
import type { PointReading, PointSection } from '../utils/pointReadout'

const LAYERS = ['fire-fill', 'marker', 'heavy', 'light', 'trail', 'vertices']

function setup({ drawing = false, layers = LAYERS } = {}) {
  made.length = 0
  const stub = stubMap({ layers, canvasWidth: 800 })
  const controller = createMapController(mapInputs({ drawing }))
  const addPoint = vi.fn()
  const board = createPopupBoard()
  const popups = mountMapPopups(stub.map, { controller, board, addPoint })
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
  return { stub, controller, addPoint, popups, opened, register, under, click, move }
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

describe('mountMapPopups point targets', () => {
  const section = (title: string, rows: string[] = []): PointSection => ({ title, source: `${title} source`, rows })
  const whole = (title: string): PointReading => ({ section: section(title) })
  // Lets every promise that has answered settle.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  function point(
    popups: ReturnType<typeof setup>['popups'],
    target: MapTarget,
    read: MapPointTarget['read'],
    { shown = (): boolean => true, paints = (): boolean | Promise<boolean> => true } = {},
  ) {
    const spy = vi.fn(read)
    popups.registerPoint({ target, shown, paints, read: spy })
    return spy
  }

  // A storm over a snowpack is described whole: both readings, one card,
  // the radar first, and either layer switched off takes the card down.
  it('puts every picture painted under the click on one card in rank order', async () => {
    const { popups, click } = setup()
    point(popups, 'snow', async () => whole('Snow'))
    point(popups, 'radar', async () => whole('Rain'))
    click()
    await settle()
    expect(made).toHaveLength(1)
    expect(made[0].html.indexOf('Rain source')).toBeLessThan(made[0].html.indexOf('Snow source'))
    popups.closeAll('snow')
    expect(made[0].removed).toBe(true)
  })

  // The card opens on what the tile says at once, and a value asked for
  // after fills its row when it lands (TJ, 2026-10-16).
  it('opens at once and fills a value that lands later', async () => {
    const { popups, click } = setup()
    let land: (s: PointSection) => void = () => {}
    point(popups, 'snow', async () => ({
      section: section('Snow', ['waiting']),
      later: new Promise<PointSection>((resolve) => (land = resolve)),
    }))
    click()
    await settle()
    expect(made).toHaveLength(1)
    expect(made[0].html).toContain('waiting')
    land(section('Snow', ['151 in']))
    await settle()
    expect(made).toHaveLength(1)
    expect(made[0].html).toContain('151 in')
    expect(made[0].html).not.toContain('waiting')
  })

  // A closed card's question is dropped rather than answered into nothing.
  it('aborts what a card was waiting for when it closes', async () => {
    const { popups, click } = setup()
    let signal: AbortSignal | null = null
    point(popups, 'snow', async (_at, s) => {
      signal = s
      return { section: section('Snow'), later: new Promise<PointSection>(() => {}) }
    })
    click()
    await settle()
    expect(signal!.aborted).toBe(false)
    popups.closeAll()
    expect(signal!.aborted).toBe(true)
  })

  // A shift-click keeps the first card and its wait.
  it('keeps filling a card that a later shift-click leaves open', async () => {
    const { popups, click } = setup()
    let land: (s: PointSection) => void = () => {}
    let first = true
    point(popups, 'snow', async () => {
      if (!first) return null
      first = false
      return { section: section('Snow', ['waiting']), later: new Promise<PointSection>((resolve) => (land = resolve)) }
    })
    click()
    await settle()
    click(true)
    land(section('Snow', ['151 in']))
    await settle()
    expect(made[0].removed).toBe(false)
    expect(made[0].html).toContain('151 in')
  })

  it('hands a reader the clicked point, its longitude wrapped, and the zoom', async () => {
    const { stub, popups } = setup()
    const read = point(popups, 'radar', async () => null)
    stub.fire('click', undefined, { point: { x: 0, y: 0 }, lngLat: { lng: 238.5, lat: 47.5 }, originalEvent: {} })
    expect(read.mock.calls[0][0]).toEqual({ lng: -121.5, lat: 47.5, zoom: 8 })
  })

  it('opens nothing where no picture painted', async () => {
    const { popups, click } = setup()
    point(popups, 'radar', async () => null)
    point(popups, 'snow', async () => null)
    click()
    await settle()
    expect(made).toEqual([])
  })

  it('never asks a picture that is switched off', () => {
    const { popups, click } = setup()
    const read = point(popups, 'snow', async () => whole('Snow'), { shown: () => false })
    click()
    expect(read).not.toHaveBeenCalled()
  })

  it('leaves a failed reading off the card and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { popups, click } = setup()
    point(popups, 'radar', async () => whole('Rain'))
    point(popups, 'snow', async () => {
      throw new Error('down')
    })
    click()
    await settle()
    expect(made).toHaveLength(1)
    expect(made[0].html).toContain('Rain')
    expect(made[0].html).not.toContain('Snow')
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('asks no picture when a shape under the click opens', () => {
    const { popups, register, under, click, opened } = setup()
    const read = point(popups, 'radar', async () => whole('Rain'))
    register('smoke', ['heavy'])
    under('heavy')
    click()
    expect(opened).toEqual([{ target: 'smoke', layer: 'heavy' }])
    expect(read).not.toHaveBeenCalled()
  })

  it('asks no picture while the ring is drawn, and places a point', () => {
    const { popups, click, addPoint } = setup({ drawing: true })
    const read = point(popups, 'radar', async () => whole('Rain'))
    click()
    expect(read).not.toHaveBeenCalled()
    expect(addPoint).toHaveBeenCalledTimes(1)
  })

  // A reader who has clicked somewhere else before the first card opened is
  // not shown a card about the place they left.
  it('drops a reading the next click made stale', async () => {
    const { popups, click } = setup()
    let answer: (r: PointReading) => void = () => {}
    let first = true
    point(popups, 'snow', (_at, signal) => {
      if (!first) return Promise.resolve(null)
      first = false
      return new Promise((resolve, reject) => {
        answer = resolve
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    click()
    click()
    answer(whole('Snow'))
    await settle()
    expect(made).toEqual([])
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
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

// The radar's frames move under an open card and a resting mouse during
// playback, and neither a click nor a move comes to say so (#748).
describe('mountMapPopups point targets that change', () => {
  const section = (title: string): PointSection => ({ title, source: `${title} source`, rows: [] })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  function changing(popups: ReturnType<typeof setup>['popups'], refresh: NonNullable<MapPointTarget['refresh']>) {
    const spy = vi.fn(refresh)
    popups.registerPoint({ target: 'radar', shown: () => true, paints: () => true, read: async () => ({ section: section('Rain') }), refresh: spy })
    popups.registerPoint({ target: 'snow', shown: () => true, paints: () => true, read: async () => ({ section: section('Snow') }) })
    return spy
  }

  it('reads an open card again where it stands, and redraws only that picture', async () => {
    const { popups, click } = setup()
    const refresh = changing(popups, async () => section('No echo'))
    click()
    await settle()
    expect(made[0].html).toContain('Rain')
    popups.refreshPoint('radar')
    await settle()
    expect(refresh.mock.calls[0][0]).toEqual({ lng: -121.5, lat: 47.5, zoom: 8 })
    expect(made[0].html).toContain('No echo')
    expect(made[0].html).not.toContain('Rain')
    expect(made[0].html).toContain('Snow')
    expect(made).toHaveLength(1)
  })

  it('asks nothing for a card that has closed, or of a picture that does not change', async () => {
    const { popups, click } = setup()
    const refresh = changing(popups, async () => section('No echo'))
    click()
    await settle()
    popups.refreshPoint('snow')
    await settle()
    expect(made[0].html).toContain('Rain')
    popups.closeAll()
    popups.refreshPoint('radar')
    expect(refresh).not.toHaveBeenCalled()
  })

  // A scrub moves faster than a tile decodes: the newest frame wins.
  it('never lets a slower answer paint over a newer frame', async () => {
    const { popups, click } = setup()
    const answers: ((s: PointSection) => void)[] = []
    changing(popups, () => new Promise((resolve) => answers.push(resolve)))
    click()
    await settle()
    popups.refreshPoint('radar')
    popups.refreshPoint('radar')
    answers[1](section('Newer'))
    answers[0](section('Older'))
    await settle()
    expect(made[0].html).toContain('Newer')
    expect(made[0].html).not.toContain('Older')
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
