import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says and whether it
// is open, keeps the one button the card carries, and fires `close` when
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
    isOpen() {
      return !this.state.removed
    }
    remove() {
      this.state.removed = true
      for (const fn of this.closers) fn()
    }
    getElement() {
      return {
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

import { mountCoordinatePopups } from './coordinatePopup'
import { createMapController } from './controller'
import { mapInputs } from '../testSupport/fixtures'
import { mountTestPopups } from '../testSupport/mapPopups'
import { stubMap } from '../testSupport/stubMap'
import { coordinatePlace, coordinatePopupHtml } from '../utils/coordinatePopup'
import type { Place } from '../utils/geocode'

const MAP_ZOOM = 13
const AT = { lng: -121.832114999, lat: 48.790123456 }
const PLACE = coordinatePlace(AT.lat, AT.lng)

beforeEach(() => {
  vi.useFakeTimers()
  popups.length = 0
})
afterEach(() => {
  vi.useRealTimers()
})

function setup({ drawing = false, searchedPlaces = [] as Place[] } = {}) {
  const stub = stubMap({ zoom: MAP_ZOOM })
  const inputs = mapInputs({ drawing, searchedPlaces, onAddPoi: vi.fn(), onRemovePoi: vi.fn() })
  const controller = createMapController(inputs)
  const { popups: mapPopups, click } = mountTestPopups(stub, controller)
  mountCoordinatePopups(stub.map, { controller, popups: mapPopups })
  const mouse = (type: string, button: number, x = 10, y = 10, shiftKey = false) =>
    stub.fire(type, undefined, { point: { x, y }, lngLat: AT, originalEvent: { button, shiftKey, preventDefault: () => {} } })
  const rightClick = (shiftKey = false) => {
    mouse('mousedown', 2, 10, 10, shiftKey)
    mouse('mouseup', 2, 10, 10, shiftKey)
  }
  const touch = (type: string, x = 10, y = 10, fingers = 1) =>
    stub.fire(type, undefined, { point: { x, y }, points: Array(fingers).fill({ x, y }), lngLat: AT })
  return { stub, inputs, mouse, rightClick, touch, click }
}

describe('mountCoordinatePopups', () => {
  it('opens the card for the spot a right-click lands on', () => {
    const { rightClick } = setup()
    rightClick()
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(coordinatePopupHtml(PLACE, false, MAP_ZOOM))
  })

  // The map's own menu, not the browser's, answers a right-click on it.
  it("refuses the browser's menu on the map", () => {
    const { stub } = setup()
    const preventDefault = vi.fn()
    stub.fire('contextmenu', undefined, { point: { x: 10, y: 10 }, lngLat: AT, originalEvent: { button: 2, preventDefault } })
    expect(preventDefault).toHaveBeenCalled()
  })

  // A right-drag is MapLibre's rotate, and a left click is the rank's.
  it('opens nothing for a right-drag or a left click', () => {
    const { mouse } = setup()
    mouse('mousedown', 2, 10, 10)
    mouse('mouseup', 2, 40, 10)
    mouse('mousedown', 0)
    mouse('mouseup', 0)
    expect(popups).toHaveLength(0)
  })

  // Right-click means "this spot" wherever it lands, so it closes the card a
  // label or a marker opened, as a click does, unless shift pins it.
  it('takes down the cards already open, unless shift pins them', () => {
    const { rightClick } = setup()
    rightClick()
    rightClick()
    expect(popups.map((p) => p.removed)).toEqual([true, false])
    rightClick(true)
    expect(popups.map((p) => p.removed)).toEqual([true, false, false])
  })

  it('opens on a long press, and keeps the card through the click that may follow', () => {
    const { touch, click } = setup()
    touch('touchstart')
    vi.advanceTimersByTime(499)
    expect(popups).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(popups).toHaveLength(1)
    touch('touchend')
    click([])
    expect(popups[0].removed).toBe(false)
  })

  // A finger that moves is panning, one that lifts was a tap, and two are a pinch.
  it('opens nothing for a pan, a tap or a pinch', () => {
    const { touch } = setup()
    touch('touchstart')
    touch('touchmove', 30, 10)
    vi.advanceTimersByTime(1000)
    touch('touchstart')
    touch('touchend')
    vi.advanceTimersByTime(1000)
    touch('touchstart', 10, 10, 2)
    vi.advanceTimersByTime(1000)
    expect(popups).toHaveLength(0)
  })

  // While drawing, the map is the ring's.
  it('opens nothing while drawing', () => {
    const { rightClick, touch } = setup({ drawing: true })
    rightClick()
    touch('touchstart')
    vi.advanceTimersByTime(1000)
    expect(popups).toHaveLength(0)
  })

  it('adds the spot as a destination, and then takes it back out', () => {
    const { inputs, rightClick } = setup()
    rightClick()
    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(PLACE)
    expect(popups[0].html).toBe(coordinatePopupHtml(PLACE, true, MAP_ZOOM))

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onRemovePoi).toHaveBeenCalledWith(PLACE.lat, PLACE.lon)
    expect(popups[0].html).toBe(coordinatePopupHtml(PLACE, false, MAP_ZOOM))
  })

  it('knows a spot the session already holds', () => {
    setup({ searchedPlaces: [PLACE] }).rightClick()
    expect(popups[0].html).toBe(coordinatePopupHtml(PLACE, true, MAP_ZOOM))
  })
})
