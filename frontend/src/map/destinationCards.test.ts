import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records what it says, keeps the one
// button a card arms and the chevrons it arms, counts each arming of its
// grid's heads, and fires `close` when removed, as MapLibre's does. Hoisted,
// because `vi.mock` runs before the imports.
type FoldButton = { key: string; press: () => void; focused: boolean }
const { popups, outlines } = vi.hoisted(() => ({
  popups: [] as {
    html: string
    removed: boolean
    attrs: Record<string, string>
    press: () => void
    // Each section's chevron in the markup last set, rebuilt by every
    // setHTML as MapLibre's are.
    folds: FoldButton[]
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
    lngLat: unknown = undefined
    constructor(options: Record<string, unknown>) {
      this.options = { ...options }
      this.state = {
        html: '',
        removed: false,
        attrs: {},
        press: () => {},
        folds: [],
        sets: [],
        gridArms: 0,
        body: { scrollTop: 0, style: {}, classList: { add: () => {} } },
      }
      popups.push(this.state)
    }
    setLngLat(at: unknown) {
      this.lngLat = at
      return this
    }
    getLngLat() {
      return this.lngLat
    }
    setHTML(html: string) {
      this.state.html = html
      this.state.sets.push({ html, focus: this.options.focusAfterOpen ?? true })
      this.state.body.scrollTop = 0
      this.state.folds = [...html.matchAll(/data-card-fold="([^"]+)"/g)].map((m) => ({
        key: m[1],
        press: () => {},
        focused: false,
      }))
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
        querySelector: (selector: string) => {
          if (selector === '.maplibregl-popup-content') return { classList: { add: () => {} } }
          if (selector.includes('data-popup-body')) return this.state.body
          // One chevron, by the key in its selector, for the focus a fold keeps.
          if (selector.includes('data-card-fold')) {
            const button = this.state.folds.find((b) => selector.includes(`"${b.key}"`))
            return button ? { focus: () => (button.focused = true) } : null
          }
          return { addEventListener: (_type: string, fn: () => void) => (this.state.press = fn) }
        },
        // The chevrons' selector, or the grid's heads' (`th[...]`), which
        // `gridHeads.ts` arms.
        querySelectorAll: (selector: string) => {
          if (selector.includes('data-card-fold')) {
            return this.state.folds.map((b) => ({
              getAttribute: () => b.key,
              addEventListener: (_type: string, fn: () => void) => (b.press = fn),
            }))
          }
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
import { AGGREGATE } from '../metrics'
import { displayedColumns } from '../utils/tableColumns'
import { type CardView, destinationPopupHtml, spotPlace } from '../utils/destinationCard'
import { type BasemapPoi, poiToPlace } from '../utils/basemapPoi'
import { type PendingDestination, pendingAsResult } from '../utils/customList'
import type { Place } from '../utils/geocode'
import type { GroundState } from '../utils/popup/groundFact'
import type { MapPoint, PointReading, PointSection } from '../utils/pointReadout'
import stateOutlines from '../utils/usStateOutlines.json'
import { decodeUsStates, type UsStateOutlines } from '../utils/usStates'

const MAP_ZOOM = 13
const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.5 })
const RAINIER = resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76 })
const PEAK: BasemapPoi = { name: 'Mount Rainier', kind: 'volcano', lat: 46.8529, lon: -121.7604, elevationFt: 14410 }
const MUIR: PendingDestination = { name: 'Camp Muir', latitude: 46.83545, longitude: -121.73231, source: 'csv' }
const SPOT = { kind: 'spot', lat: 48.790123, lon: -121.832114 } as const

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

function setup({
  searchedPlaces = [] as Place[],
  ground = undefined as GroundReadings | undefined,
  moving = undefined as (() => boolean) | undefined,
} = {}) {
  const stub = stubMap({ canvasWidth: 1280, canvasHeight: 900, zoom: MAP_ZOOM, moving })
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
        sections: [],
        folds: new Map(),
        columns: controller.inputs.popupColumns,
        modelId: controller.inputs.modelId,
        times: controller.inputs.times,
        modelFallbackLabel: null,
        rankedBy: controller.inputs.sortBy,
        pointSample: false,
        compact: false,
        widths: {},
        removable: true,
        analyzedAtMs: controller.inputs.analyzedAtMs,
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

  // A spot's card carries no owner: what it holds is the layers' sections,
  // which leave it when their layer goes off rather than taking it down.
  it("leaves a spot's card open when a layer is switched off", () => {
    const { cards, board } = setup()
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    board.closeAll('radar')
    expect(popups[0].removed).toBe(false)
    board.closeAll()
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
    controller.update({ ...controller.inputs, results: [a, b], popupColumns: displayedColumns(false, 'aqi_avg') })
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
    const controller = createMapController(
      mapInputs({ results: [ADAMS, RAINIER], popupColumns: displayedColumns(false, 'aqi_avg'), onRemoveResult: vi.fn() }),
    )
    const { popups: board } = mountTestPopups(stub, controller)
    let widths: Record<string, number> = {}
    let resized = () => {}
    const cards = mountDestinationCards(stub.map, {
      controller,
      popups: board,
      gridHeads: { widths: () => widths, arm: () => {}, onResize: (fn) => (resized = fn) },
    })
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    widths = { [AGGREGATE.average]: 80 }
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

// Every card asks every layer that is on for its section at the card's point
// (#832), and hears when one changes under it.
describe('sections', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const section = (kind: PointSection['kind'], layer: string, title: string, rows: string[] = []): PointSection => ({
    kind,
    layer,
    title,
    source: `${layer} source`,
    rows,
  })
  const RAIN = section('radar', 'Rain radar', 'Light precipitation', ['Rate: 0.1 in/hr'])
  const SNOW = section('snow', 'Snow depth', 'Deep snow')
  // Whether a section's chevron says it is open, read off the card's markup.
  const expanded = (html: string, key: string) => new RegExp(`data-card-fold="${key}"[^>]*aria-expanded="(true|false)"`).exec(html)?.[1]

  // A layer the test answers for, registered with the map's real popups.
  function layer(
    board: ReturnType<typeof setup>['board'],
    kind: PointSection['kind'],
    read: (signal: AbortSignal) => PointReading | null | Promise<PointReading | null>,
    { shown = () => true, refresh }: { shown?: () => boolean; refresh?: () => Promise<PointReading> } = {},
  ) {
    const spy = vi.fn((_at: MapPoint, signal: AbortSignal) => read(signal))
    const again = refresh && vi.fn(refresh)
    board.registerPoint({ target: kind, shown, paints: () => false, read: spy, ...(again && { refresh: again }) })
    return { read: spy, refresh: again }
  }

  it('asks every layer that is on at the point, and stands their sections in rank order whatever order they answer in', async () => {
    const { cards, board } = setup()
    const answers: Partial<Record<string, (r: PointReading | null) => void>> = {}
    const asked = (kind: PointSection['kind']) => () => new Promise<PointReading | null>((resolve) => (answers[kind] = resolve))
    const snow = layer(board, 'snow', asked('snow'))
    layer(board, 'radar', asked('radar'))
    const off = layer(board, 'smoke', async () => null, { shown: () => false })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    expect(snow.read).toHaveBeenCalledTimes(1)
    expect(off.read).not.toHaveBeenCalled()
    // Asked where the card stands, at the five decimals its title shows.
    const [at] = snow.read.mock.calls[0]
    expect(at.lat).toBe(48.79012)
    expect(at.lng).toBeCloseTo(-121.83211, 9)
    expect(at.zoom).toBe(MAP_ZOOM)
    answers.snow!({ section: SNOW })
    await settle()
    expect(popups[0].html).toContain('Snow depth: Deep snow')
    // A section landing is a redraw, which leaves the reader's focus alone.
    expect(popups[0].sets[popups[0].sets.length - 1].focus).toBe(false)
    answers.radar!({ section: RAIN })
    await settle()
    const html = popups[0].html
    expect(html.indexOf('Rain radar: Light precipitation')).toBeGreaterThan(-1)
    expect(html.indexOf('Rain radar: Light precipitation')).toBeLessThan(html.indexOf('Snow depth: Deep snow'))
    expect(popups).toHaveLength(1)
  })

  it('puts no section on the card where a layer has nothing there', async () => {
    const { cards, board } = setup()
    layer(board, 'radar', async () => null)
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].html).not.toContain('Rain radar')
    expect(popups[0].sets).toHaveLength(1)
  })

  // The snow's numbers come from NOAA after its band (TJ, 2026-10-16).
  it('fills a section with what lands after it', async () => {
    const { cards, board } = setup()
    let land: (s: PointSection) => void = () => {}
    layer(board, 'snow', async () => ({
      section: section('snow', 'Snow depth', 'Deep snow', ['waiting']),
      later: new Promise<PointSection>((resolve) => (land = resolve)),
    }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].html).toContain('waiting')
    land(section('snow', 'Snow depth', 'Deep snow', ['151 in']))
    await settle()
    expect(popups[0].html).toContain('151 in')
    expect(popups[0].html).not.toContain('waiting')
  })

  it('leaves a failed reading off the card and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { cards, board } = setup()
    layer(board, 'radar', async () => ({ section: RAIN }))
    layer(board, 'snow', async () => {
      throw new Error('down')
    })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].html).toContain('Rain radar')
    expect(popups[0].html).not.toContain('Snow depth')
    expect(popups[0].removed).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('The snow reading failed')
  })

  // The radar's frame moved under the card (#748), or a fire layer's fetch
  // landed or it went off (#832).
  it('reads a layer again when it changes, and takes its section off once it is off', async () => {
    const { cards, board } = setup()
    let on = true
    const radar = layer(board, 'radar', async () => ({ section: RAIN }), {
      shown: () => on,
      refresh: async () => ({ section: section('radar', 'Rain radar', 'No echo') }),
    })
    const snow = layer(board, 'snow', async () => ({ section: SNOW }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    board.refreshPoint('radar')
    await settle()
    expect(radar.read).toHaveBeenCalledTimes(1)
    expect(radar.refresh).toHaveBeenCalledTimes(1)
    expect(popups[0].html).toContain('Rain radar: No echo')
    expect(popups[0].html).toContain('Snow depth')
    // A layer with no refresh of its own is read again.
    board.refreshPoint('snow')
    await settle()
    expect(snow.read).toHaveBeenCalledTimes(2)
    on = false
    board.refreshPoint('radar')
    await settle()
    expect(popups[0].html).not.toContain('Rain radar')
    expect(popups[0].html).toContain('Snow depth')
    expect(popups[0].removed).toBe(false)
  })

  // A layer that switches on after the card opened joins it on its change.
  it('puts a layer that comes on after the card opened on it', async () => {
    const { cards, board } = setup()
    let on = false
    layer(board, 'fire', async () => ({ section: section('fire', 'Wildfires', 'Bolt Creek') }), { shown: () => on })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].html).not.toContain('Bolt Creek')
    on = true
    board.refreshPoint('fire')
    await settle()
    expect(popups[0].html).toContain('Wildfires: Bolt Creek')
  })

  // A scrub moves faster than a tile decodes: the newest frame wins.
  it('never lets a slower answer paint over a newer one', async () => {
    const { cards, board } = setup()
    const answers: ((r: PointReading) => void)[] = []
    layer(board, 'radar', async () => ({ section: RAIN }), {
      refresh: () => new Promise<PointReading>((resolve) => answers.push(resolve)),
    })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    board.refreshPoint('radar')
    board.refreshPoint('radar')
    answers[1]({ section: section('radar', 'Rain radar', 'Newer') })
    answers[0]({ section: section('radar', 'Rain radar', 'Older') })
    await settle()
    expect(popups[0].html).toContain('Newer')
    expect(popups[0].html).not.toContain('Older')
  })

  // A closed card's question is dropped rather than answered into nothing.
  it('aborts what a card was waiting for when it closes, and writes nothing after', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { cards, board } = setup()
    let signal: AbortSignal | null = null
    let answer: (r: PointReading) => void = () => {}
    layer(board, 'snow', (s) => {
      signal = s
      return new Promise<PointReading>((resolve, reject) => {
        answer = resolve
        s.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    expect(signal!.aborted).toBe(false)
    board.closeAll()
    expect(signal!.aborted).toBe(true)
    answer({ section: SNOW })
    await settle()
    expect(popups[0].sets).toHaveLength(1)
    expect(warn).not.toHaveBeenCalled()
  })

  // A fold the reader makes holds for that section on every card until the
  // page reloads (TJ, 2026-11-03), and the chevron pressed keeps the focus.
  it('folds a section on every card from one chevron, and keeps the focus on it', async () => {
    const { cards, board } = setup()
    layer(board, 'radar', async () => ({ section: RAIN }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    cards.open({ kind: 'label', poi: PEAK }, [PEAK.lon, PEAK.lat], { pan: false })
    await settle()
    expect(popups.map((p) => expanded(p.html, 'radar'))).toEqual(['true', 'true'])
    popups[0].folds.find((b) => b.key === 'radar')!.press()
    expect(popups.map((p) => expanded(p.html, 'radar'))).toEqual(['false', 'false'])
    expect(popups[0].html).not.toContain('Rate: 0.1 in/hr')
    expect(popups.map((p) => p.folds.find((b) => b.key === 'radar')!.focused)).toEqual([true, false])
    // Every write was a redraw, so MapLibre moved focus for none of them.
    expect(popups[1].sets[popups[1].sets.length - 1].focus).toBe(false)
    // A card opened later wears the reader's fold.
    cards.open({ ...SPOT, lat: 47.5 }, [SPOT.lon, 47.5], { pan: false })
    await settle()
    expect(expanded(popups[2].html, 'radar')).toBe('false')
    popups[1].folds.find((b) => b.key === 'radar')!.press()
    expect(popups.map((p) => expanded(p.html, 'radar'))).toEqual(['true', 'true', 'true'])
    expect(popups[1].folds.find((b) => b.key === 'radar')!.focused).toBe(true)
  })

  // A ranked card opens on its forecast with the layers folded under it.
  it("folds a ranked card's layers and opens its forecast by default", async () => {
    const { cards, board, controller } = setup()
    controller.update({ ...controller.inputs, popupColumns: displayedColumns(false, 'aqi_avg') })
    layer(board, 'radar', async () => ({ section: RAIN }))
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    await settle()
    expect(expanded(popups[0].html, 'radar')).toBe('false')
    expect(expanded(popups[0].html, 'forecast')).toBe('true')
    expect(popups[0].html.indexOf('Rain radar')).toBeLessThan(popups[0].html.indexOf('data-card-fold="forecast"'))
  })

  // The forecast section's fine print says when the report was analyzed.
  it("draws the analysis's time on a ranked card", () => {
    const { cards, controller, rankedHtml } = setup()
    const analyzedAtMs = Date.UTC(2026, 10, 3, 21, 36)
    controller.update({ ...controller.inputs, popupColumns: displayedColumns(false, 'aqi_avg'), analyzedAtMs })
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [0, 0])
    expect(popups[0].html).toBe(rankedHtml(RAINIER, 2, { analyzedAtMs }))
    expect(popups[0].html).toContain('Analyzed')
    expect(popups[0].html).not.toBe(rankedHtml(RAINIER, 2, { analyzedAtMs: null }))
  })

  // A card that grew past the free map when a section landed is capped
  // where it stands, and keeps that cap through later redraws.
  it('caps a card that grew where it stands', async () => {
    const { cards, board } = setup()
    const cap = vi.spyOn(board, 'bodyCap').mockReturnValue(120)
    layer(board, 'radar', async () => ({ section: RAIN }))
    layer(board, 'snow', async () => ({ section: SNOW }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].body.style.maxHeight).toBe('120px')
    expect(cap).toHaveBeenCalledTimes(1)
    expect(popups[0].sets.length).toBeGreaterThan(2)
  })

  // A section that answers at once is in the markup the fit measured, so the
  // card is placed whole and nothing pops in under the reader (TJ,
  // 2026-11-03). Asked after the card opened, every section landed a frame
  // later on a card fitted without it.
  it("draws every section that answers at once in the card's first paint", () => {
    const { cards, board } = setup()
    layer(board, 'fire', () => ({ section: section('fire', 'Wildfires', 'Bolt Creek') }))
    layer(board, 'snow', () => ({ section: SNOW }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    const card = popups[popups.length - 1]
    expect(card.sets).toHaveLength(1)
    expect(card.sets[0].html).toContain('Wildfires: Bolt Creek')
    expect(card.sets[0].html).toContain('Snow depth: Deep snow')
  })

  // Two clicks on one table row open one card.
  it('opens the same card twice on the same point', () => {
    const { cards, board } = setup()
    layer(board, 'fire', () => ({ section: section('fire', 'Wildfires', 'Bolt Creek') }))
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [RAINIER.longitude, RAINIER.latitude], { pan: false })
    board.closeAll()
    cards.open({ kind: 'ranked', row: RAINIER, rank: 2 }, [RAINIER.longitude, RAINIER.latitude], { pan: false })
    expect(popups[popups.length - 1].sets[0].html).toBe(popups[0].sets[0].html)
  })

  // A table row's card rides its flight, and its point is anywhere along the
  // way until the flight lands: a cap measured mid-flight left the body at its
  // floor, or nothing at all on a card that then grew past the map's top.
  it('caps a card that grew in the air where the move leaves it', async () => {
    let moving = true
    const { cards, board, stub } = setup({ moving: () => moving })
    const cap = vi.spyOn(board, 'bodyCap').mockReturnValue(140)
    layer(board, 'radar', async () => ({ section: RAIN }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat], { pan: false })
    await settle()
    expect(popups[0].html).toContain('Rain radar')
    expect(cap).not.toHaveBeenCalled()
    expect(popups[0].body.style.maxHeight).toBeUndefined()
    moving = false
    stub.fire('moveend')
    expect(cap).toHaveBeenCalledTimes(1)
    expect(popups[0].body.style.maxHeight).toBe('140px')
    // Its own listener goes with the move it waited for.
    stub.fire('moveend')
    expect(cap).toHaveBeenCalledTimes(1)
  })

  // The radar answers a frame with no echo under a card that had one with
  // the no-echo line (#748), and a dry point with nothing at all. A card that
  // carried no radar is asked as an opening one is, so a card open while the
  // radar came on says what one opened after it does.
  it("reads a layer through its refresh only on a card that carries the layer's section", async () => {
    const { cards, board } = setup()
    let wet = false
    const radar = layer(board, 'radar', async () => (wet ? { section: RAIN } : null), {
      refresh: async () => ({ section: section('radar', 'Rain radar', 'No echo') }),
    })
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    board.refreshPoint('radar')
    await settle()
    expect(radar.refresh).not.toHaveBeenCalled()
    expect(radar.read).toHaveBeenCalledTimes(2)
    expect(popups[0].html).not.toContain('Rain radar')
    wet = true
    board.refreshPoint('radar')
    await settle()
    expect(popups[0].html).toContain('Rain radar: Light precipitation')
    board.refreshPoint('radar')
    await settle()
    expect(radar.refresh).toHaveBeenCalledTimes(1)
    expect(popups[0].html).toContain('Rain radar: No echo')
  })

  it('caps nothing where the card still stands whole', async () => {
    const { cards, board } = setup()
    layer(board, 'radar', async () => ({ section: RAIN }))
    cards.open(SPOT, [SPOT.lon, SPOT.lat])
    await settle()
    expect(popups[0].html).toContain('Rain radar')
    expect(popups[0].body.style.maxHeight).toBeUndefined()
  })
})
