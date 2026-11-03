import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says, keeps the one
// button a card arms and counts each arming of its grid's heads, and fires
// `close` when removed, as MapLibre's does. Hoisted, because `vi.mock` runs
// before the imports.
const { popups, outlines } = vi.hoisted(() => ({
  popups: [] as {
    html: string
    removed: boolean
    attrs: Record<string, string>
    press: () => void
    // Each setHTML, with whether MapLibre would have moved focus for it.
    sets: { html: string; focus: unknown }[]
    gridArms: number
    body: { scrollTop: number; style: Record<string, string>; classList: { add: () => void } }
  }[],
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
    state: (typeof popups)[number]
    closers: (() => void)[] = []
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      this.options = { ...options }
      this.state = {
        html: '',
        removed: false,
        attrs: {},
        press: () => {},
        sets: [],
        gridArms: 0,
        body: { scrollTop: 0, style: {}, classList: { add: () => {} } },
      }
      popups.push(this.state)
    }
    setLngLat() {
      return this
    }
    setHTML(html: string) {
      this.state.html = html
      this.state.sets.push({ html, focus: this.options.focusAfterOpen ?? true })
      this.state.body.scrollTop = 0
      return this
    }
    addTo() {
      return this
    }
    isOpen() {
      return !this.state.removed
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
        offsetWidth: 280,
        offsetHeight: 200,
        setAttribute: (k: string, v: string) => (this.state.attrs[k] = v),
        querySelector: (selector: string) =>
          selector === '.maplibregl-popup-content'
            ? { classList: { add: () => {} } }
            : selector.includes('data-popup-body')
              ? this.state.body
              : { addEventListener: (_type: string, fn: () => void) => (this.state.press = fn) },
        querySelectorAll: () => {
          this.state.gridArms++
          return []
        },
      }
    }
  },
}))

import { mountDestinationCards } from './destinationCards'
import { createGridHeads } from './gridHeads'
import type { GroundReadings } from './groundReadings'
import { createMapController } from './controller'
import { mountTestPopups } from '../testSupport/mapPopups'
import { mapInputs, resultRow } from '../testSupport/fixtures'
import { stubMap } from '../testSupport/stubMap'
import { type CardView, destinationPopupHtml, spotPlace } from '../utils/destinationCard'
import { type BasemapPoi, poiToPlace } from '../utils/basemapPoi'
import { type PendingDestination, pendingAsResult } from '../utils/customList'
import type { Place } from '../utils/geocode'
import type { GroundState } from '../utils/popup/groundFact'
import type { PointSection } from '../utils/pointReadout'
import stateOutlines from '../utils/usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from '../utils/usStates'

const MAP_ZOOM = 13
const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.5 })
const RAINIER = resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76 })
const PEAK: BasemapPoi = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }
const MUIR: PendingDestination = { name: 'Camp Muir', latitude: 46.83545, longitude: -121.73231, source: 'csv' }
const SPOT = { kind: 'spot', lat: 48.790123, lon: -121.832114, sections: [] as readonly PointSection[] } as const

beforeEach(() => {
  popups.length = 0
  outlines.held = null
  outlines.load = null
  outlines.calls = 0
})
afterEach(() => {
  vi.restoreAllMocks()
})

function fakeGround() {
  let state: GroundState = { kind: 'pending' }
  const redraws: (() => void)[] = []
  const ground: GroundReadings = { at: () => state, onRead: (redraw) => redraws.push(redraw) }
  const land = (next: GroundState) => {
    state = next
    for (const redraw of redraws) redraw()
  }
  return { ground, land, at: () => state }
}

function setup({ searchedPlaces = [] as Place[], ground = undefined as GroundReadings | undefined } = {}) {
  const stub = stubMap({ canvasWidth: 1280, canvasHeight: 900, zoom: MAP_ZOOM })
  const inputs = mapInputs({
    results: [ADAMS, RAINIER],
    searchedPlaces,
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    onRemoveResult: vi.fn(),
  })
  const controller = createMapController(inputs)
  const { popups: board } = mountTestPopups(stub, controller)
  const gridHeads = createGridHeads(controller)
  const cards = mountDestinationCards(stub.map, { controller, popups: board, gridHeads, ground })
  // What the map would draw for a subject now, for a test to compare against.
  const rankedHtml = (row: typeof ADAMS, rank: number | string, over: CardView = {}) =>
    destinationPopupHtml(
      { kind: 'ranked', row, rank },
      {
        mapZoom: MAP_ZOOM,
        usStates: null,
        ground: ground?.at(row.latitude, row.longitude),
        added: false,
        columns: controller.inputs.popupColumns,
        warning: null,
        closure: null,
        modelId: controller.inputs.modelId,
        times: controller.inputs.times,
        modelFallbackLabel: null,
        rankedBy: controller.inputs.sortBy,
        pointSample: false,
        compact: false,
        widths: {},
        removable: true,
        ...over,
      },
    )
  return { stub, inputs, controller, board, cards, rankedHtml }
}

describe('mountDestinationCards', () => {
  it("opens a ranked row's card, marked for the tutorial, and answers its remove with the row's", () => {
    const { cards, inputs, rankedHtml } = setup()
    const opened = cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [RAINIER.longitude, RAINIER.latitude])
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(rankedHtml(RAINIER, 2))
    expect(popups[0].attrs).toEqual({ 'data-tour': 'marker' })
    expect(popups[0].gridArms).toBe(1)
    expect(opened).toMatchObject({ dx: 0, dy: 0 })
    popups[0].press()
    expect(inputs.onRemoveResult).toHaveBeenCalledWith(RAINIER)
    expect(popups[0].removed).toBe(true)
  })

  // The pending row's ×, whatever named the destination (TJ, 2026-11-03).
  it("opens a pending destination's card, whose remove is the row's removal", () => {
    const { cards, inputs } = setup()
    cards.open({ kind: 'pending', pending: MUIR }, [MUIR.longitude, MUIR.latitude])
    expect(popups[0].html).toBe(
      destinationPopupHtml({ kind: 'pending', pending: MUIR }, { mapZoom: MAP_ZOOM, usStates: null, added: false }),
    )
    expect(popups[0].attrs).toEqual({})
    expect(popups[0].gridArms).toBe(0)
    popups[0].press()
    expect(inputs.onRemoveResult).toHaveBeenCalledWith(pendingAsResult(MUIR))
    expect(inputs.onRemovePoi).not.toHaveBeenCalled()
    expect(popups[0].removed).toBe(true)
  })

  it('offers to add a clicked label, and then to take it back out, flipping on the press', () => {
    const { cards, inputs } = setup()
    const labelHtml = (added: boolean) =>
      destinationPopupHtml({ kind: 'label', poi: PEAK }, { mapZoom: MAP_ZOOM, usStates: null, added })
    cards.open({ kind: 'label', poi: PEAK }, [PEAK.lon, PEAK.lat])
    expect(popups[0].html).toBe(labelHtml(false))
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(poiToPlace(PEAK))
    expect(popups[0].html).toBe(labelHtml(true))
    // A press, so focus goes where MapLibre puts it.
    expect(popups[0].sets[1].focus).toBe(true)
    popups[0].press()
    expect(inputs.onRemovePoi).toHaveBeenCalledWith(PEAK.lat, PEAK.lon)
    expect(popups[0].html).toBe(labelHtml(false))
    expect(popups[0].removed).toBe(false)
  })

  it('knows a label the session already holds', () => {
    const { cards } = setup({ searchedPlaces: [poiToPlace(PEAK)] })
    cards.open({ kind: 'label', poi: PEAK }, [PEAK.lon, PEAK.lat])
    expect(popups[0].html).toContain('Remove from analysis')
  })

  // A click on bare map (#832): the spot registers as a pasted coordinate
  // does, at the five decimals its title shows, and is known again by them.
  it('opens a spot, registers it as a coordinate, and knows it again', () => {
    const { cards, inputs } = setup()
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    expect(popups[0].html).toContain('48.79012, -121.83211')
    expect(popups[0].html).toContain('Add to analysis')
    popups[0].press()
    expect(inputs.onAddPoi).toHaveBeenCalledWith(spotPlace(SPOT.lat, SPOT.lon))
    expect(popups[0].html).toContain('Remove from analysis')

    const again = setup({ searchedPlaces: [spotPlace(SPOT.lat, SPOT.lon)] })
    again.cards.open(SPOT, [SPOT.lon, SPOT.lat])
    expect(popups[1].html).toContain('Remove from analysis')
    popups[1].press()
    expect(again.inputs.onRemovePoi).toHaveBeenCalledWith(48.79012, -121.83211)
  })

  // The pictures' sections land after the card opens, and the opener hands
  // the owners on so a picture switched off takes the card down.
  it("redraws a spot's sections where it stands, under the owners it was opened for", () => {
    const { cards, board } = setup()
    const rain: PointSection = { title: 'Light precipitation', source: 'NEXRAD radar', rows: ['Rate: 0.1'], when: 'now' }
    const opened = cards.open(SPOT, [SPOT.lon, SPOT.lat], { owner: ['radar'] })
    expect(popups[0].html).not.toContain('NEXRAD radar')
    opened.update({ ...SPOT, sections: [rain] })
    expect(popups[0].html).toContain('NEXRAD radar: now')
    expect(popups[0].sets[1].focus).toBe(false)
    board.closeAll('radar')
    expect(popups[0].removed).toBe(true)
  })

  it('puts each card on the board under its kind', () => {
    const { cards, board } = setup()
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    cards.open({ kind: 'pending', pending: MUIR }, [0, 0], { pan: false })
    cards.open({ kind: 'label', poi: PEAK }, [0, 0])
    board.closeAll('pending')
    expect(popups.map((p) => p.removed)).toEqual([false, true, false])
    board.closeAll('poi')
    expect(popups.map((p) => p.removed)).toEqual([false, true, true])
    board.closeAll('result')
    expect(popups.map((p) => p.removed)).toEqual([true, true, true])
  })

  it('says whether a ranked card stands open on a destination', () => {
    const { cards, board } = setup()
    const at = (row: typeof ADAMS) => ({ latitude: row.latitude, longitude: row.longitude })
    cards.open({ kind: 'pending', pending: { ...MUIR, latitude: RAINIER.latitude, longitude: RAINIER.longitude } }, [0, 0])
    expect(cards.hasOpenRanked(at(RAINIER))).toBe(false)
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    expect(cards.hasOpenRanked(at(RAINIER))).toBe(true)
    expect(cards.hasOpenRanked(at(ADAMS))).toBe(false)
    board.closeAll()
    expect(cards.hasOpenRanked(at(RAINIER))).toBe(false)
  })
})

// A redraw answers something the reader did elsewhere, so it keeps the cap,
// the scroll and the reader's focus, and arms the new nodes again.
describe('redrawing', () => {
  it('draws the ground on every card when its read lands, arming the grid again', () => {
    const { ground, land } = fakeGround()
    const { cards, rankedHtml } = setup({ ground })
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    cards.open({ kind: 'label', poi: PEAK }, [0, 0], { pan: false })
    cards.open(SPOT, [0, 0], { pan: false })
    const armed = popups[0].gridArms
    popups[0].body.scrollTop = 40
    land({ kind: 'read', reading: { elevationM: 4391, degrees: 12.3, aspect: 90 } })
    expect(popups[0].html).toBe(rankedHtml(RAINIER, 2))
    for (const p of popups) {
      expect(p.html).toContain('12°')
      expect(p.sets.map((s) => s.focus)).toEqual([true, false])
    }
    expect(popups[0].gridArms).toBe(armed + 1)
    expect(popups[0].body.scrollTop).toBe(40)
  })

  it('moves a ranked card onto its row again when the ranking changes', () => {
    const { cards, controller, rankedHtml } = setup()
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    controller.update({ ...controller.inputs, sortBy: 'wind_max_mph', results: [RAINIER, ADAMS] })
    cards.refresh()
    expect(popups[0].html).toBe(rankedHtml(RAINIER, 1))
    expect(popups[0].html).toContain('#1 Mount Rainier')
    // A row the presentation no longer shows keeps its numbers, unranked.
    controller.update({ ...controller.inputs, results: [ADAMS] })
    cards.refresh()
    expect(popups[0].removed).toBe(false)
    expect(popups[0].html).toBe(rankedHtml(RAINIER, ''))
  })

  // A comparison stands one row per model on a destination, so the card keeps
  // the model it was opened on rather than the first row at its coordinates.
  it('keeps the model a comparison card was opened on', () => {
    const a = { ...RAINIER, modelId: 'gfs_seamless', modelLabel: 'GFS' }
    const b = { ...RAINIER, modelId: 'ecmwf_ifs025', modelLabel: 'ECMWF', temp_max_f: 12.5 }
    const { cards, controller } = setup()
    controller.update({ ...controller.inputs, results: [a, b] })
    cards.open({ kind: 'ranked', row: b, rank: 2 }, [0, 0])
    controller.update({ ...controller.inputs, results: [{ ...b }, { ...a }], sortBy: 'temp_max_f' })
    cards.refresh()
    expect(popups[0].html).toContain('12.5')
    expect(popups[0].html).toContain('#1 ')
  })

  it('writes nothing when a card shows what it would show, and nothing once it is closed', () => {
    const { cards, controller, board } = setup()
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    cards.refresh()
    expect(popups[0].sets).toHaveLength(1)
    board.closeAll()
    controller.update({ ...controller.inputs, results: [RAINIER, ADAMS] })
    cards.refresh()
    expect(popups[0].sets).toHaveLength(1)
  })

  // A column a reader sizes on one card, every card then wears.
  it('redraws every card when a grid column is resized', () => {
    const stub = stubMap({ canvasWidth: 1280, canvasHeight: 900, zoom: MAP_ZOOM })
    const controller = createMapController(mapInputs({ results: [ADAMS, RAINIER], onRemoveResult: vi.fn() }))
    const { popups: board } = mountTestPopups(stub, controller)
    let widths: Record<string, number> = {}
    let resized = () => {}
    const cards = mountDestinationCards(stub.map, {
      controller,
      popups: board,
      gridHeads: { widths: () => widths, arm: () => {}, onResize: (fn) => (resized = fn) },
    })
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    widths = { avg: 80 }
    resized()
    expect(popups[0].sets).toHaveLength(2)
    expect(popups[0].html).not.toBe(popups[0].sets[0].html)
  })

  // A crag's search names its state once the outlines are held (#734); a
  // card opened before they land is drawn again then, and a peak asks nothing.
  it("redraws an open crag's card with its state once the outlines land", async () => {
    const { cards } = setup()
    cards.open({ kind: 'label', poi: PEAK }, [0, 0])
    expect(outlines.calls).toBe(0)
    const crag: BasemapPoi = { name: 'Family Wall', kind: 'crag', lat: 47.48886, lon: -121.75024, osmId: 'way/1307110189' }
    cards.open({ kind: 'label', poi: crag }, [0, 0], { pan: false })
    expect(popups[1].html).toContain('search?q=Family%20Wall"')
    expect(outlines.calls).toBe(1)
    outlines.load!(decodeUsStates(stateOutlines as UsStateOutlines))
    await vi.waitFor(() => expect(popups[1].html).toContain('search?q=Family%20Wall%20Washington"'))
  })
})
