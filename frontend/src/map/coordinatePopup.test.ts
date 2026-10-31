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
import type { DemTiles } from './terrain'
import { mapInputs, resultRow } from '../testSupport/fixtures'
import { markupText } from '../testSupport/markupText'
import { mountTestPopups } from '../testSupport/mapPopups'
import { stubMap } from '../testSupport/stubMap'
import { FEET_PER_METER } from '../utils/basemapPoi'
import { coordinatePlace } from '../utils/coordinatePopup'
import type { Place } from '../utils/geocode'
import { COVERAGE_PHRASE, OpenMeteoModelCoverage } from '../utils/openMeteoErrors'
import { popupButton } from '../utils/popup/popupChrome'
import { POI_ACTION_ATTR } from '../utils/poiPopup'
import type { PointForecast, pointForecast } from '../utils/pointForecast'
import { displayedColumns } from '../utils/tableColumns'

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

// The spot's forecast as `pointForecast` would answer it: a temperature to find.
const FORECAST: PointForecast = { row: resultRow({ temp_avg_f: 27.4 }), aqiFailed: false }

/** Ground at 8,412 ft on every tile, flat, as the elevation tiles would answer it. */
const FLAT_DEM = {
  getDemTile: async () => ({ width: 4, height: 4, data: new Float32Array(16).fill(8412 / FEET_PER_METER) }),
} as unknown as DemTiles

function setup({
  drawing = false,
  searchedPlaces = [] as Place[],
  answer = (async () => FORECAST) as typeof pointForecast,
} = {}) {
  const stub = stubMap({ zoom: MAP_ZOOM })
  const inputs = mapInputs({
    drawing,
    searchedPlaces,
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    modelId: 'gfs_seamless',
    modelFallbackLabel: 'NOAA GFS',
    pointSample: true,
    popupColumns: displayedColumns(true, 'aqi_avg'),
  })
  const controller = createMapController(inputs)
  const { popups: mapPopups, click } = mountTestPopups(stub, controller)
  const terrain = { demTiles: vi.fn(async () => FLAT_DEM), credit: vi.fn() }
  const forecast = vi.fn(answer)
  const coordinates = mountCoordinatePopups(stub.map, { controller, popups: mapPopups, terrain, forecast })
  const mouse = (type: string, button: number, x = 10, y = 10, shiftKey = false) =>
    stub.fire(type, undefined, { point: { x, y }, lngLat: AT, originalEvent: { button, shiftKey, preventDefault: () => {} } })
  const rightClick = (shiftKey = false) => {
    mouse('mousedown', 2, 10, 10, shiftKey)
    mouse('mouseup', 2, 10, 10, shiftKey)
  }
  const touch = (type: string, x = 10, y = 10, fingers = 1) =>
    stub.fire(type, undefined, { point: { x, y }, points: Array(fingers).fill({ x, y }), lngLat: AT })
  return { stub, inputs, controller, coordinates, terrain, forecast, mouse, rightClick, touch, click }
}

const ADD = popupButton(`${POI_ACTION_ATTR}="add"`, 'Add to analysis')
const REMOVE = popupButton(`${POI_ACTION_ATTR}="remove"`, 'Remove from analysis')

describe('mountCoordinatePopups', () => {
  it('opens the card for the spot a right-click lands on', () => {
    const { rightClick } = setup()
    rightClick()
    expect(popups).toHaveLength(1)
    expect(markupText(popups[0].html)).toContain('48.79012, -121.83211')
    expect(popups[0].html).toContain(ADD)
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
    expect(popups[0].html).toContain(REMOVE)

    vi.runAllTimers()
    popups[0].press()
    expect(inputs.onRemovePoi).toHaveBeenCalledWith(PLACE.lat, PLACE.lon)
    expect(popups[0].html).toContain(ADD)
  })

  it('knows a spot the session already holds', () => {
    setup({ searchedPlaces: [PLACE] }).rightClick()
    expect(popups[0].html).toContain(REMOVE)
  })

  // Option A: the card opens at once and fills in as the ground and the
  // forecast land, for the window and model the inputs name.
  it('fills in the ground and the forecast once each lands', async () => {
    const { rightClick, forecast, inputs } = setup()
    rightClick()
    expect(markupText(popups[0].html)).not.toContain('27.4')
    await vi.runAllTimersAsync()
    expect(markupText(popups[0].html)).toMatch(/8,412 ft\s*·\s*0°/)
    expect(markupText(popups[0].html)).toContain('27.4')
    const [at, height, window] = forecast.mock.calls[0]
    expect(at).toEqual({ lat: PLACE.lat, lon: PLACE.lon })
    expect(await height).toBeCloseTo(8412, 0)
    expect(window).toEqual({
      startMs: inputs.forecastStartMs,
      endMs: inputs.forecastEndMs,
      model: 'gfs_seamless',
      windowLimits: inputs.windowLimits,
      aqiForecastDays: inputs.aqiForecastDays,
    })
  })

  // Mapterhorn's elevation is CC BY 4.0, and with every terrain row off no
  // source on the map credits it, so the card holds the credit while open.
  it("holds Mapterhorn's credit while the card is open", async () => {
    const { rightClick, terrain } = setup()
    rightClick()
    expect(terrain.credit).toHaveBeenLastCalledWith(true)
    await vi.runAllTimersAsync()
    // The next right-click takes this card down and opens its own.
    rightClick()
    expect(terrain.credit.mock.calls.map((c) => c[0])).toEqual([true, false, true])
  })

  it("says the model's failure in the card", async () => {
    const { rightClick } = setup({
      answer: (async () => {
        throw new OpenMeteoModelCoverage('gfs_seamless')
      }) as typeof pointForecast,
    })
    rightClick()
    await vi.runAllTimersAsync()
    expect(markupText(popups[0].html)).toContain(`NOAA GFS ${COVERAGE_PHRASE}`)
  })

  // A card left open across a new analysis follows it, as a ranked card does.
  it('asks again when the window moves, and only then', async () => {
    const { rightClick, controller, coordinates, forecast, inputs } = setup()
    rightClick()
    await vi.runAllTimersAsync()
    coordinates.refresh()
    expect(forecast).toHaveBeenCalledOnce()
    controller.update({ ...inputs, forecastStartMs: inputs.forecastStartMs + 3_600_000 })
    coordinates.refresh()
    expect(forecast).toHaveBeenCalledTimes(2)
    expect(forecast.mock.calls[0][3].aborted).toBe(true)
  })
})
