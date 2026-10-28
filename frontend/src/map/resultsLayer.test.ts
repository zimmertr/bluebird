import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records where it opened, what it says
// and its options, and fires `close` when removed, as MapLibre's does.
// Hoisted, because `vi.mock` runs before the imports.
type FakeBody = {
  offsetHeight: number
  scrollTop?: number
  style: { maxHeight?: string }
  classes: string[]
  classList: { add: (c: string) => void }
  // The one listener a card arms, its remove button's.
  addEventListener: (type: string, fn: () => void) => void
  press?: () => void
}
const { popups } = vi.hoisted(() => ({
  popups: [] as {
    at: unknown
    html: string
    options: unknown
    removed: boolean
    attrs: Record<string, string>
    body: FakeBody
    // The classes the library's content box was handed (POPUP_FACE).
    face: string[]
    // Each setHTML, with whether MapLibre would have moved focus for it.
    sets: { html: string; focus: unknown }[]
  }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state: (typeof popups)[number]
    closers: (() => void)[] = []
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) {
      const classes: string[] = []
      const body: FakeBody = {
        offsetHeight: BODY_H,
        style: {},
        classes,
        classList: { add: (c) => classes.push(c) },
        addEventListener: (_type, fn) => (body.press = fn),
      }
      this.options = { ...options }
      this.state = { at: null, html: '', options, removed: false, attrs: {}, body, face: [], sets: [] }
      popups.push(this.state)
    }
    setLngLat(at: unknown) {
      this.state.at = at
      return this
    }
    // MapLibre's default is to move focus into the popup when content is set.
    // New markup arrives uncapped and scrolled to the top, as a real body would.
    setHTML(html: string) {
      this.state.html = html
      this.state.sets.push({ html, focus: this.options.focusAfterOpen ?? true })
      const body = this.state.body
      body.style = {}
      body.classes.length = 0
      body.scrollTop = 0
      return this
    }
    addTo() {
      return this
    }
    // The element MapLibre would own, at the size a full card measures; the
    // fit reads it and the tutorial marks it (#536). Its body is what a cap
    // shortens, and the card shrinks by what the body loses.
    getElement() {
      const body = this.state.body
      const shown = body.style.maxHeight ? Math.min(BODY_H, parseFloat(body.style.maxHeight)) : BODY_H
      return {
        offsetWidth: CARD_W,
        offsetHeight: CARD_H - BODY_H + shown,
        setAttribute: (k: string, v: string) => (this.state.attrs[k] = v),
        querySelector: (selector: string) =>
          selector === '.maplibregl-popup-content'
            ? { classList: { add: (...cs: string[]) => this.state.face.push(...cs) } }
            : body,
      }
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

import { makeArrowImage, mountResultsLayer, RESULT_MARKER_LAYER } from './resultsLayer'
import { POPUP_PAN_MS } from '../utils/popupFit'
import { createMapController, type MapInputs } from './controller'
import { mountTestPopups } from '../testSupport/mapPopups'
import { featureRow, pendingFC } from '../utils/mapFeatures'
import { RESULT_ACTION_ATTR, resultPopupHtml } from '../utils/resultPopup'
import { POPUP_TINT_ATTR } from '../utils/popupChrome'
import { displayedColumns } from '../utils/tableColumns'
import { resultsFeatureCollection } from '../utils/resultFeatures'
import { closureWarning, mapInputs, resultRow } from '../testSupport/fixtures'
import { closurePopupText } from '../utils/closureProximity'
import { geoKey } from '../utils/points'
import { stubMap } from '../testSupport/stubMap'
import { MARKER_HALO_PAINT, MARKER_LABEL_PAINT, MARKER_PAINT, PENDING_COLOR } from './mapStyles'
import { POPUP_FACE } from '../styles'

// A full card's size, and a map tall enough to hold one below a centred marker.
const CARD_W = 280
const CARD_H = 360
// The part of the card under the title band, which a cap shortens.
const BODY_H = 270
const MAP_W = 1280
const MAP_H = 900

const ADAMS = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.5 })
const RAINIER = resultRow({ name: 'Mount Rainier', latitude: 46.85, longitude: -121.76 })

beforeEach(() => {
  popups.length = 0
  // The node project has no DOM. A canvas with no 2D context is what a browser
  // without one hands back, and the arrow builder has to survive it.
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function setup(results = [ADAMS, RAINIER], markerAt?: { x: number; y: number }, canvasWidth = MAP_W) {
  const stub = stubMap({ canvasWidth, canvasHeight: MAP_H, markerAt, zoom: MAP_ZOOM })
  const inputs = mapInputs({
    results,
    modelId: 'gfs_seamless',
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    onRemoveResult: vi.fn(),
  })
  const controller = createMapController(inputs)
  const { popups: board, click } = mountTestPopups(stub, controller)
  const layer = mountResultsLayer(stub.map, { controller, popups: board })
  // A click on a marker: the rendered feature, whose properties carry the
  // exact coordinates the row is matched on.
  const clickMarker = (row: typeof ADAMS, rank: number, shiftKey = false) =>
    click(
      [
        {
          layer: { id: RESULT_MARKER_LAYER },
          geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
          properties: { rank, name: row.name, lat: row.latitude, lon: row.longitude },
        },
      ],
      { shiftKey },
    )
  return { stub, layer, controller, board, clickMarker }
}

// The map's zoom when a card is drawn, which its CalTopo link carries (#712).
const MAP_ZOOM = 13

describe('mountResultsLayer', () => {
  it('adds the markers and then the pending dots, arrows hidden', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      'results-halo',
      RESULT_MARKER_LAYER,
      'results-wind',
      'results-rank',
      'results-labels',
      'pending-destinations-halo',
      'pending-destinations-circles',
      'pending-destinations-labels',
    ])
    expect(stub.layout['results-wind'].visibility).toBe('none')
  })

  // The result marker and the pending dot were one recipe spelled twice, so a
  // change to one could miss the other (#365). Both now spread MARKER_PAINT,
  // and only the colour differs; the labels under them read one recipe too.
  it('draws the ranked marker and the pending dot from one recipe', () => {
    const { stub } = setup()
    const ranked = stub.paint[RESULT_MARKER_LAYER]
    const pending = stub.paint['pending-destinations-circles']
    expect(ranked).toEqual({ ...MARKER_PAINT, 'circle-color': ['get', 'color'] })
    expect(pending).toEqual({ ...MARKER_PAINT, 'circle-color': PENDING_COLOR })
    // Each under its own dark ring, the edge a light ground reads (#799).
    expect(stub.paint['results-halo']).toEqual(MARKER_HALO_PAINT)
    expect(stub.paint['pending-destinations-halo']).toEqual(MARKER_HALO_PAINT)
    expect(stub.paint['results-labels']).toEqual(MARKER_LABEL_PAINT)
    expect(stub.paint['pending-destinations-labels']).toEqual(MARKER_LABEL_PAINT)
  })

  it('draws the rows the results table ranks, for the hour under the playhead', () => {
    const { stub, layer } = setup()
    layer.update({ results: [ADAMS, RAINIER], sortBy: 'precip_total_in', playbackIndex: 2 })
    expect(stub.sources.results.data).toEqual(
      resultsFeatureCollection([ADAMS, RAINIER], 'precip_total_in', true, 2),
    )
  })

  it('shows the arrows for a wind ranking under the playhead, and sets them only on a change', () => {
    const { stub, layer } = setup()
    const visibility = () =>
      stub.calls.filter((c) => c[0] === 'setLayoutProperty' && c[1] === 'results-wind').map((c) => c[3])
    layer.update({ results: [ADAMS], sortBy: 'precip_total_in', playbackIndex: 1 })
    layer.update({ results: [ADAMS], sortBy: 'wind_avg_mph', playbackIndex: 1 })
    layer.update({ results: [ADAMS], sortBy: 'wind_avg_mph', playbackIndex: 2 })
    layer.update({ results: [ADAMS], sortBy: 'wind_avg_mph', playbackIndex: null })
    expect(visibility()).toEqual(['visible', 'none'])
  })

  it('draws a dot for each pending destination', () => {
    const { stub, layer } = setup()
    const pending = [{ name: 'Mount Baker', latitude: 48.78, longitude: -121.81, source: 'csv' as const }]
    layer.setPending(pending)
    expect(stub.sources['pending-destinations'].data).toEqual(pendingFC(pending))
  })

  it('opens the forecast popup for the row behind a clicked marker', () => {
    const { controller, clickMarker } = setup()
    clickMarker(RAINIER, 2)
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual([RAINIER.longitude, RAINIER.latitude])
    expect(popups[0].options).toMatchObject({ closeOnClick: false })
    const live = controller.inputs
    expect(popups[0].html).toBe(
      resultPopupHtml({
        rank: 2,
        row: RAINIER,
        columns: live.popupColumns,
        warning: null,
        modelId: live.modelId,
        times: live.times,
        modelFallbackLabel: null,
        rankedBy: live.sortBy,
        compact: false,
        mapZoom: MAP_ZOOM,
        removable: true,
      }),
    )
  })

  // The guard behind the match: a marker whose coordinates the controller
  // holds no row for opens on the feature's own properties, which carry no
  // aggregates, so each metric cell reads the dash rather than nothing or
  // another row's numbers.
  it("opens a card from the marker's own properties when no row matches it", () => {
    const { controller, clickMarker } = setup()
    controller.update({ ...controller.inputs, popupColumns: displayedColumns(false, 'aqi_avg') })
    const ghost = { ...RAINIER, name: 'Ghost Peak', latitude: 45.1, longitude: -119.9 }
    clickMarker(ghost, 5)
    const live = controller.inputs
    const props = { rank: 5, name: ghost.name, lat: ghost.latitude, lon: ghost.longitude }
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(
      resultPopupHtml({
        rank: 5,
        row: featureRow(props, ghost.latitude, ghost.longitude),
        columns: live.popupColumns,
        warning: null,
        modelId: live.modelId,
        times: live.times,
        modelFallbackLabel: null,
        rankedBy: live.sortBy,
        compact: false,
        mapZoom: MAP_ZOOM,
        removable: true,
      }),
    )
    expect(popups[0].html).toContain('—')
    for (const name of [ADAMS.name, RAINIER.name]) expect(popups[0].html).not.toContain(name)
  })

  // The popup's closure line reads the same map the table's Closure column
  // does, keyed on the marker's exact coordinates (#550).
  it('names the closure a clicked destination stands inside', () => {
    const { controller, clickMarker } = setup()
    const closure = closureWarning()
    controller.update({
      ...controller.inputs,
      closureWarnings: new Map([[geoKey(RAINIER.latitude, RAINIER.longitude), closure]]),
    })
    clickMarker(RAINIER, 2)
    expect(popups[0].html).toContain(closurePopupText(closure))
  })

  // The card marks the number the report ranks by, read from the inputs at
  // click time, and narrows its bands on a phone's map (TJ, 2026-10-08).
  it('hands the popup the ranking and a narrow map\'s compact insets', () => {
    const { controller, clickMarker } = setup([ADAMS, RAINIER], undefined, 360)
    controller.update({ ...controller.inputs, popupColumns: displayedColumns(false, 'temp_max_f'), sortBy: 'temp_max_f' })
    clickMarker(RAINIER, 2)
    const live = controller.inputs
    expect(popups[0].html).toBe(
      resultPopupHtml({
        rank: 2,
        row: RAINIER,
        columns: live.popupColumns,
        warning: null,
        modelId: live.modelId,
        times: live.times,
        modelFallbackLabel: null,
        rankedBy: 'temp_max_f',
        compact: true,
        mapZoom: MAP_ZOOM,
        removable: true,
      }),
    )
    // The ranked family wears the table's colours (#740).
    expect(popups[0].html).toContain(POPUP_TINT_ATTR)
  })

  // A finger reaches a row's remove through the card its row tap opens
  // (#696): the button does what the row's × does, and the card goes with
  // the row it described.
  it('removes the row from its card, and closes the card', () => {
    const { controller, clickMarker } = setup()
    clickMarker(RAINIER, 2)
    expect(popups[0].html).toContain(`${RESULT_ACTION_ATTR}="remove"`)
    popups[0].body.press!()
    expect(controller.inputs.onRemoveResult).toHaveBeenCalledWith(RAINIER)
    expect(popups[0].removed).toBe(true)
  })

  it('re-arms the remove when a redraw replaces the button', () => {
    const { controller, clickMarker, layer } = setup()
    clickMarker(RAINIER, 2)
    controller.update({ ...controller.inputs, results: [RAINIER, ADAMS] })
    layer.refreshPopups()
    expect(popups[0].sets).toHaveLength(2)
    popups[0].body.press!()
    expect(controller.inputs.onRemoveResult).toHaveBeenCalledWith(RAINIER)
  })

  it('replaces the open popup on a click and keeps it on a shift-click', () => {
    const { clickMarker } = setup()
    clickMarker(ADAMS, 1)
    clickMarker(RAINIER, 2, true)
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    clickMarker(ADAMS, 1)
    expect(popups.map((p) => p.removed)).toEqual([true, true, false])
  })

  it('opens a table row the way a marker opens it, ranked by its place in the rows', () => {
    const { layer, controller } = setup()
    layer.openPopup(RAINIER)
    expect(popups).toHaveLength(1)
    expect(popups[0].at).toEqual([RAINIER.longitude, RAINIER.latitude])
    const live = controller.inputs
    expect(popups[0].html).toBe(
      resultPopupHtml({
        rank: 2,
        row: RAINIER,
        columns: live.popupColumns,
        warning: null,
        modelId: live.modelId,
        times: live.times,
        modelFallbackLabel: null,
        rankedBy: live.sortBy,
        compact: false,
        mapZoom: MAP_ZOOM,
        removable: true,
      }),
    )
  })

  // The fit itself is `popupFit.test.ts`; this is the layer applying it:
  // which side the card is built on, and what the map is told to do.
  // The table hands over a copy of the row stamped with its rank (#579),
  // which is not among the map's rows; the card still names the rank.
  // A rank Rainier's place among the rows cannot produce, so a copy looked up
  // by its coordinates rather than read by its stamp would print the wrong one.
  // A row's centring places its card again for a resized canvas only while
  // the card stands (#714), so the layer says whether one stands on a place.
  it('says whether a result card stands open on a destination', () => {
    const { layer, board, clickMarker } = setup()
    const at = (row: typeof ADAMS) => ({ latitude: row.latitude, longitude: row.longitude })
    expect(layer.hasOpenCard(at(RAINIER))).toBe(false)
    layer.openPopup(RAINIER)
    expect(layer.hasOpenCard(at(RAINIER))).toBe(true)
    expect(layer.hasOpenCard(at(ADAMS))).toBe(false)
    // A click on another marker closes it and opens that one's.
    clickMarker(ADAMS, 1)
    expect(layer.hasOpenCard(at(RAINIER))).toBe(false)
    expect(layer.hasOpenCard(at(ADAMS))).toBe(true)
    // The next report closes every card (#577).
    board.closeAll()
    expect(layer.hasOpenCard(at(ADAMS))).toBe(false)
  })

  it('ranks a table row by the stamp it carries', () => {
    const { layer } = setup()
    layer.openPopup({ ...RAINIER, rank: 7 } as typeof RAINIER)
    expect(popups[0].html).toContain('#7 Mount Rainier')
  })

  it('hangs the card below a centred marker and moves nothing', () => {
    const { stub, layer } = setup()
    expect(layer.openPopup(RAINIER)).toEqual({ dx: 0, dy: 0 })
    expect(popups).toHaveLength(1)
    expect(popups[0].options).toMatchObject({ anchor: 'top', closeOnClick: false })
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([])
  })

  // A card wears the app's card on the library's own box (record 0222).
  it('dresses the card in the app\'s face', () => {
    const { layer } = setup()
    layer.openPopup(RAINIER)
    expect(popups[0].face).toEqual(POPUP_FACE.split(' '))
  })

  // A card too tall for the free map area keeps its title and scrolls its body
  // (TJ, 2026-10-08), and is placed at the height it will be drawn at.
  it('caps a card the free map cannot hold, and scrolls its body under the title', () => {
    const { layer, controller } = setup()
    // The visible map is 330 tall: a 360 card cannot stand whole in it.
    controller.update({ ...controller.inputs, cameraPadBottomPx: MAP_H - 330 })
    layer.openPopup(RAINIER, { markerAt: { x: 640, y: 100 } })
    const shown = popups.filter((p) => !p.removed)
    expect(shown).toHaveLength(1)
    const body = shown[0].body
    expect(body.classes).toEqual(['popup-scroll'])
    // The tallest card that stands whole: the map less the margin the fit
    // keeps at its top edge, the tip, and the marker's square.
    const cap = 330 - 8 - 10 - 8
    expect(body.style.maxHeight).toBe(`${BODY_H - (CARD_H - cap)}px`)
  })

  it('leaves a card that fits alone', () => {
    const { layer } = setup()
    layer.openPopup(RAINIER)
    expect(popups[0].body.classes).toEqual([])
    expect(popups[0].body.style.maxHeight).toBeUndefined()
  })

  it('rebuilds the card above a marker near the bottom, before a frame is drawn', () => {
    const { layer } = setup([ADAMS, RAINIER], { x: 640, y: 880 })
    expect(layer.openPopup(RAINIER)).toEqual({ dx: 0, dy: 0 })
    expect(popups.map((p) => [p.options, p.removed])).toEqual([
      [expect.objectContaining({ anchor: 'top' }), true],
      [expect.objectContaining({ anchor: 'bottom' }), false],
    ])
  })

  it('places against where a caller is about to put the marker, above the sheet', () => {
    const { layer, controller } = setup()
    controller.update({ ...controller.inputs, cameraPadBottomPx: 500 })
    // The visible map is 400 tall; a card hanging from its centre runs under
    // the sheet by 178, so the marker is asked up by that much.
    expect(layer.openPopup(RAINIER, { markerAt: { x: 640, y: 200 } })).toEqual({ dx: 0, dy: -178 })
  })

  // A marker click may pan where `openPopup` never does, so these are the
  // one check that a click whose card fits pans nothing.
  it('moves nothing on a marker click whose card fits, below or above the marker', () => {
    const { stub, clickMarker } = setup([ADAMS, RAINIER], { x: 640, y: 40 })
    clickMarker(RAINIER, 2)
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([])
    const { stub: low, clickMarker: clickLow } = setup([ADAMS, RAINIER], { x: 640, y: 880 })
    clickLow(RAINIER, 2)
    // Above the marker fits whole, so no pan.
    expect(low.calls.filter((c) => c[0] === 'panBy')).toEqual([])
  })

  // A marker over the sheet does need one, marker and card together.
  it('pans by what the fit asked for on a marker click', () => {
    const { stub: buried, controller, clickMarker: clickBuried } = setup([ADAMS, RAINIER], { x: 640, y: 880 })
    controller.update({ ...controller.inputs, cameraPadBottomPx: 500 })
    clickBuried(RAINIER, 2)
    expect(buried.calls.filter((c) => c[0] === 'panBy')).toEqual([
      ['panBy', [0, 496], { duration: POPUP_PAN_MS }],
    ])
  })

  it('marks the popup a table row opens as the tutorial\'s marker target', () => {
    const { layer } = setup()
    layer.openPopup(RAINIER)
    expect(popups[popups.length - 1].attrs).toEqual({ 'data-tour': 'marker' })
  })

  // A table row's popup is on the board, so a second table click replaces it
  // rather than opening a second one beside it.
  it('takes down the last table row popup when the next one opens', () => {
    const { layer, board } = setup()
    layer.openPopup(ADAMS)
    layer.openPopup(RAINIER)
    expect(popups.map((p) => p.removed)).toEqual([true, false])
    board.closeAll()
    expect(popups.map((p) => p.removed)).toEqual([true, true])
  })
})

// An open card follows the report the way the table does (TJ, 2026-10-08):
// a new ranking moves its mark and its rank without the card being reopened.
describe('refreshPopups', () => {
  const COLS = displayedColumns(false, 'aqi_avg')
  const cardFor = (live: MapInputs, row: typeof ADAMS, rank: number | string, sortBy = live.sortBy) =>
    resultPopupHtml({
      rank,
      row,
      columns: live.popupColumns,
      warning: null,
      modelId: live.modelId,
      times: live.times,
      modelFallbackLabel: null,
      rankedBy: sortBy,
      compact: false,
      mapZoom: MAP_ZOOM,
      removable: true,
    })

  it('moves the ranked mark and the rank when the ranking changes', () => {
    const { layer, controller } = setup()
    controller.update({ ...controller.inputs, popupColumns: COLS })
    layer.openPopup(RAINIER)
    expect(popups[0].html).toBe(cardFor(controller.inputs, RAINIER, 2))
    // A wind ranking that puts Rainier first.
    controller.update({ ...controller.inputs, sortBy: 'wind_max_mph', results: [RAINIER, ADAMS] })
    layer.refreshPopups()
    expect(popups).toHaveLength(1)
    expect(popups[0].html).toBe(cardFor(controller.inputs, RAINIER, 1, 'wind_max_mph'))
    expect(popups[0].html).not.toBe(cardFor(controller.inputs, RAINIER, 1, 'aqi_avg'))
  })

  it('drops a column the reader hides', () => {
    const { layer, controller } = setup()
    controller.update({ ...controller.inputs, popupColumns: COLS })
    layer.openPopup(RAINIER)
    const fewer = COLS.filter((c) => !(c.key as string).startsWith('temp_'))
    controller.update({ ...controller.inputs, popupColumns: fewer })
    layer.refreshPopups()
    expect(popups[0].html).toBe(cardFor(controller.inputs, RAINIER, 2))
    expect(popups[0].html).not.toContain('Temperature')
  })

  // The change was made in the panel, so focus stays there: MapLibre moves it
  // into a popup whenever its content is set, unless told not to.
  it('redraws without moving focus, and leaves the option as it found it', () => {
    const { layer, controller } = setup()
    layer.openPopup(RAINIER)
    controller.update({ ...controller.inputs, results: [RAINIER, ADAMS] })
    layer.refreshPopups()
    expect(popups[0].sets.map((x) => x.focus)).toEqual([true, false])
    layer.openPopup(ADAMS)
    expect(popups[1].sets.map((x) => x.focus)).toEqual([true])
  })

  it('leaves a card alone when nothing it shows changed', () => {
    const { layer } = setup()
    layer.openPopup(RAINIER)
    layer.refreshPopups()
    expect(popups[0].sets).toHaveLength(1)
  })

  it('keeps a row the presentation stopped displaying, without a rank', () => {
    const { layer, controller } = setup()
    controller.update({ ...controller.inputs, popupColumns: COLS })
    layer.openPopup(RAINIER)
    controller.update({ ...controller.inputs, results: [ADAMS], sortBy: 'temp_max_f' })
    layer.refreshPopups()
    expect(popups[0].removed).toBe(false)
    expect(popups[0].html).toBe(cardFor(controller.inputs, RAINIER, ''))
  })

  it('stops redrawing a card once it is closed', () => {
    const { layer, controller, board } = setup()
    layer.openPopup(RAINIER)
    board.closeAll()
    controller.update({ ...controller.inputs, results: [RAINIER, ADAMS] })
    layer.refreshPopups()
    expect(popups[0].sets).toHaveLength(1)
  })

  // A comparison stands one row per model on a destination, so the card keeps
  // the model it was opened on rather than the first row at its coordinates.
  it('keeps the model a comparison card was opened on', () => {
    const a = { ...RAINIER, modelId: 'gfs_seamless', modelLabel: 'GFS' }
    const b = { ...RAINIER, modelId: 'ecmwf_ifs025', modelLabel: 'ECMWF', temp_max_f: 12.5 }
    const { layer, controller } = setup([a, b])
    controller.update({ ...controller.inputs, popupColumns: COLS })
    layer.openPopup(b)
    // Re-ranked into new row objects, as a fresh presentation may hand over.
    const a2 = { ...a }
    const b2 = { ...b }
    controller.update({ ...controller.inputs, results: [b2, a2], sortBy: 'temp_max_f' })
    layer.refreshPopups()
    expect(popups[0].html).toContain('12.5')
    expect(popups[0].html).toContain('#1 ')
  })

  it('keeps a capped card capped, and where the reader had scrolled it', () => {
    const { layer, controller } = setup()
    controller.update({ ...controller.inputs, cameraPadBottomPx: MAP_H - 330 })
    layer.openPopup(RAINIER, { markerAt: { x: 640, y: 100 } })
    const card = popups.find((p) => !p.removed)!
    const capped = card.body.style.maxHeight
    card.body.scrollTop = 40
    controller.update({ ...controller.inputs, results: [RAINIER, ADAMS] })
    layer.refreshPopups()
    expect(card.body.style.maxHeight).toBe(capped)
    expect(card.body.classes).toEqual(['popup-scroll'])
    expect(card.body.scrollTop).toBe(40)
  })
})

describe('makeArrowImage', () => {
  // Null rather than a throw: the caller skips the image and the map draws on.
  it('returns null where the canvas has no 2D context', () => {
    expect(makeArrowImage()).toBeNull()
  })
})
