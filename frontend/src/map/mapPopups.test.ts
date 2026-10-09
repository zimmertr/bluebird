import { describe, expect, it, vi } from 'vitest'

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

import { createMapController, type MapInputs } from './controller'
import { mountMapPopups, type MapPopupTarget } from './mapPopups'
import { createPopupBoard, popupOptions } from './popups'
import { stubMap, type StubFeature } from '../testSupport/stubMap'
import type { MapTarget } from '../utils/mapClick'

const LAYERS = ['fire-fill', 'marker', 'heavy', 'light', 'trail', 'vertices']

function setup({ drawing = false, layers = LAYERS } = {}) {
  made.length = 0
  const stub = stubMap({ layers, canvasWidth: 800 })
  const controller = createMapController({ drawing } as MapInputs)
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
        popups.create([0, 0], target, { owner: target })
      },
      ...extra,
    })
  const under = (...ids: string[]) => stub.setUnder(ids.map((id): StubFeature => ({ layer: { id } })))
  const click = (shiftKey = false) =>
    stub.fire('click', undefined, { point: { x: 10, y: 20 }, lngLat: { lng: -121.5, lat: 47.5 }, originalEvent: { shiftKey } })
  const move = () => stub.fire('mousemove', undefined, { point: { x: 10, y: 20 } })
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
      controller: createMapController({ drawing: false } as MapInputs),
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
      controller: createMapController({ drawing: false } as MapInputs),
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
      controller: createMapController({ drawing: false } as MapInputs),
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

describe('mountMapPopups create', () => {
  // Every popup is made the same way: the board's width rule, never
  // closeOnClick, and on the board under its owner.
  it('makes every popup with the shared options, on the board under its owner', () => {
    const { stub, popups } = setup()
    popups.create([0, 0], '<p>fire</p>', { owner: 'fire' })
    popups.create([0, 0], '<p>card</p>', { owner: 'result', result: true, anchor: 'bottom', className: 'card' })
    popups.create([0, 0], '<p>rm</p>', { offset: [0, -8], closeButton: false })
    expect(made.map((p) => p.options)).toEqual([
      { ...popupOptions(stub.map), closeOnClick: false },
      { ...popupOptions(stub.map, { result: true }), closeOnClick: false, anchor: 'bottom', className: 'card' },
      { ...popupOptions(stub.map), closeOnClick: false, offset: [0, -8], closeButton: false },
    ])
    popups.closeAll('fire')
    expect(made.map((p) => p.removed)).toEqual([true, false, false])
    popups.closeAll()
    expect(made.every((p) => p.removed)).toBe(true)
  })
})
