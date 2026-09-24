import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says, whether it is
// open, and the one button a remove-point popup carries. Hoisted, because
// `vi.mock` runs before the imports.
const { popups } = vi.hoisted(() => ({
  popups: [] as { html: string; removed: boolean; click: () => void }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state = { html: '', removed: false, click: () => {} }
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
    remove() {
      this.state.removed = true
    }
    getElement() {
      return {
        querySelector: () => ({
          addEventListener: (_type: string, fn: () => void) => {
            this.state.click = fn
          },
        }),
      }
    }
  },
}))

import { mountDrawRing } from './drawRing'
import { createMapController, type MapInputs } from './controller'
import { stubMap } from '../testSupport/stubMap'

type Pts = [number, number][]
const TRI: Pts = [
  [0, 0],
  [10, 0],
  [5, 10],
]

// The node project has no document, and a drag listens on it: this one keeps
// the listeners so a test can move the pointer and let go.
const listeners = new Map<string, (e: unknown) => void>()
beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
  listeners.clear()
  vi.stubGlobal('document', {
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(points: Pts = TRI, drawing = true) {
  const stub = stubMap()
  const inputs: MapInputs = {
    drawing,
    results: [],
    modelId: null,
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    fireWarnings: new Map(),
    searchedPlaces: [],
    onAddPoi: () => {},
    onRemovePoi: () => {},
    cameraPadBottomPx: 0,
    onCameraMove: () => {},
  }
  const ring = { current: points }
  const deps = {
    ring,
    controller: createMapController(inputs),
    restCursor: vi.fn(),
    onPolygonChange: vi.fn(),
    onDrawUpdate: vi.fn(),
  }
  const drawRing = mountDrawRing(stub.map, deps)
  return { stub, ring, deps, drawRing }
}

const handle = (props: Record<string, number>, lngLat = { lng: 0, lat: 0 }) => ({
  features: [{ properties: props }],
  lngLat,
  preventDefault: vi.fn(),
})

describe('mountDrawRing', () => {
  it('adds the fill, the outline, then the midpoints under the vertices', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual(['draw-fill', 'draw-line', 'draw-midpoints', 'draw-vertices'])
  })

  // A hidden handle fires no event, which is what makes draw mode real.
  it('opens with the handles shown only in draw mode', () => {
    expect(setup(TRI, true).stub.layout['draw-vertices'].visibility).toBe('visible')
    expect(setup(TRI, false).stub.layout['draw-midpoints'].visibility).toBe('none')
  })

  it('draws a ring the component already holds', () => {
    const { stub } = setup()
    expect(stub.calls.find((c) => c[0] === 'addSource')?.[2]).toMatchObject({
      data: { type: 'FeatureCollection' },
    })
    expect(setup([]).stub.sources.draw).toBeDefined()
  })

  it('commits a point placed by a click', () => {
    const { ring, deps, drawRing } = setup(TRI.slice(0, 2))
    drawRing.addPoint([5, 10])
    expect(ring.current).toHaveLength(3)
    expect(deps.onDrawUpdate).toHaveBeenLastCalledWith(3)
    expect(deps.onPolygonChange).toHaveBeenLastCalledWith({
      type: 'Polygon',
      coordinates: [[...ring.current, ring.current[0]]],
    })
  })

  // The URL follows the ring on every edit, but never mid-drag.
  it('drags a vertex, committing only when it is let go', () => {
    const { stub, ring, deps } = setup()
    const down = handle({ index: 1 })
    stub.fire('mousedown', 'draw-vertices', down)
    expect(down.preventDefault).toHaveBeenCalled()
    expect(stub.dragPan.enabled).toBe(false)
    expect(stub.canvas.style.cursor).toBe('grabbing')
    listeners.get('mousemove')!({ clientX: 20, clientY: 3 })
    expect(ring.current[1]).toEqual([20, 3])
    expect(deps.onPolygonChange).not.toHaveBeenCalled()
    listeners.get('mouseup')!({})
    expect(deps.onPolygonChange).toHaveBeenCalledTimes(1)
    expect(stub.dragPan.enabled).toBe(true)
    expect(deps.restCursor).toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it('drags with one finger and ignores a pinch', () => {
    const { stub, ring } = setup()
    stub.fire('touchstart', 'draw-vertices', handle({ index: 0 }))
    listeners.get('touchmove')!({ touches: [{}, {}], preventDefault: vi.fn() })
    expect(ring.current[0]).toEqual([0, 0])
    listeners.get('touchmove')!({ touches: [{ clientX: 4, clientY: 4 }], preventDefault: vi.fn() })
    expect(ring.current[0]).toEqual([4, 4])
    listeners.get('touchend')!({})
    expect(listeners.size).toBe(0)
  })

  it('inserts a vertex on a midpoint and drags the new one', () => {
    const { stub, ring, deps } = setup()
    stub.fire('mousedown', 'draw-midpoints', handle({ segment: 0 }, { lng: 5, lat: 0 }))
    expect(ring.current).toEqual([[0, 0], [5, 0], [10, 0], [5, 10]])
    expect(deps.onDrawUpdate).toHaveBeenLastCalledWith(4)
    listeners.get('mousemove')!({ clientX: 5, clientY: -2 })
    expect(ring.current[1]).toEqual([5, -2])
  })

  it('removes a vertex from the popup a click on it opens', () => {
    const { stub, ring, deps } = setup([...TRI, [0, 5]])
    stub.fire('click', 'draw-vertices', handle({ index: 3 }))
    expect(popups[0].html).toContain('Remove point')
    vi.runAllTimers()
    popups[0].click()
    expect(ring.current).toEqual(TRI)
    expect(deps.onDrawUpdate).toHaveBeenLastCalledWith(3)
    expect(popups[0].removed).toBe(true)
  })

  it('keeps one remove-point popup at a time and drops it outside draw mode', () => {
    const { stub, drawRing } = setup()
    stub.fire('click', 'draw-vertices', handle({ index: 0 }))
    stub.fire('click', 'draw-vertices', handle({ index: 1 }))
    expect(popups[0].removed).toBe(true)
    drawRing.setDrawing(false)
    expect(popups[1].removed).toBe(true)
    expect(stub.layout['draw-vertices'].visibility).toBe('none')
  })

  it('keeps the grab cursor when the pointer leaves a handle mid-drag', () => {
    const { stub, deps } = setup()
    stub.fire('mouseenter', 'draw-midpoints')
    expect(stub.canvas.style.cursor).toBe('grab')
    stub.fire('mousedown', 'draw-vertices', handle({ index: 0 }))
    stub.fire('mouseleave', 'draw-vertices')
    expect(deps.restCursor).not.toHaveBeenCalled()
  })
})
