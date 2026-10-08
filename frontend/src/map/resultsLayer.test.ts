import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records where it opened, what it says
// and its options, and fires `close` when removed, as MapLibre's does.
// Hoisted, because `vi.mock` runs before the imports.
type FakeBody = { offsetHeight: number; style: { maxHeight?: string }; classes: string[]; classList: { add: (c: string) => void } }
const { popups } = vi.hoisted(() => ({
  popups: [] as {
    at: unknown
    html: string
    options: unknown
    removed: boolean
    attrs: Record<string, string>
    body: FakeBody
  }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state: (typeof popups)[number]
    closers: (() => void)[] = []
    constructor(options: unknown) {
      const classes: string[] = []
      const body: FakeBody = { offsetHeight: BODY_H, style: {}, classes, classList: { add: (c) => classes.push(c) } }
      this.state = { at: null, html: '', options, removed: false, attrs: {}, body }
      popups.push(this.state)
    }
    setLngLat(at: unknown) {
      this.state.at = at
      return this
    }
    setHTML(html: string) {
      this.state.html = html
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
        querySelector: () => body,
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

import { makeArrowImage, mountResultsLayer, POPUP_PAN_MS, RESULT_MARKER_LAYER } from './resultsLayer'
import { createMapController, type MapInputs } from './controller'
import { createPopupBoard } from './popups'
import { pendingFC } from '../utils/mapFeatures'
import { resultPopupHtml } from '../utils/resultPopup'
import { resultsFeatureCollection } from '../utils/resultFeatures'
import { closureWarning, resultRow } from '../testSupport/fixtures'
import { closureWarningText } from '../utils/closureProximity'
import { geoKey } from '../utils/points'
import { stubMap } from '../testSupport/stubMap'
import { MARKER_LABEL_PAINT, MARKER_PAINT, PENDING_COLOR } from './mapStyles'
import { MAX_POLYGON_POINTS } from '../utils/drawGeometry'

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

function setup(results = [ADAMS, RAINIER], markerAt?: { x: number; y: number }) {
  const stub = stubMap({ canvasWidth: MAP_W, canvasHeight: MAP_H, markerAt })
  const inputs: MapInputs = {
    drawing: false,
    results,
    modelId: 'gfs_seamless',
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    fireWarnings: new Map(),
    closureWarnings: new Map(),
    searchedPlaces: [],
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    cameraPadBottomPx: 0,
    onCameraMove: () => {},
    maxPolygonPoints: MAX_POLYGON_POINTS,
  }
  const controller = createMapController(inputs)
  const board = createPopupBoard()
  const restCursor = vi.fn()
  const layer = mountResultsLayer(stub.map, { controller, popups: board, restCursor })
  return { stub, layer, controller, board, restCursor }
}

// A click on a marker, as MapLibre hands it over: the rendered feature, whose
// properties carry the exact coordinates the row is matched on.
function markerClick(row: typeof ADAMS, rank: number, shiftKey = false) {
  return {
    originalEvent: { shiftKey },
    features: [
      {
        geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
        properties: { rank, name: row.name, lat: row.latitude, lon: row.longitude },
      },
    ],
  }
}

describe('mountResultsLayer', () => {
  it('adds the markers and then the pending dots, arrows hidden', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([
      RESULT_MARKER_LAYER,
      'results-wind',
      'results-rank',
      'results-labels',
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
    const { stub, controller } = setup()
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2))
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
      }),
    )
  })

  // The popup's closure line reads the same map the table's Closure column
  // does, keyed on the marker's exact coordinates (#550).
  it('names the closure a clicked destination stands inside', () => {
    const { stub, controller } = setup()
    const closure = closureWarning()
    controller.update({
      ...controller.inputs,
      closureWarnings: new Map([[geoKey(RAINIER.latitude, RAINIER.longitude), closure]]),
    })
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2))
    expect(popups[0].html).toContain(closureWarningText(closure))
  })

  it('replaces the open popup on a click and keeps it on a shift-click', () => {
    const { stub } = setup()
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(ADAMS, 1))
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2, true))
    expect(popups.map((p) => p.removed)).toEqual([false, false])
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(ADAMS, 1))
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
      }),
    )
  })

  // The fit itself is `popupFit.test.ts`; this is the layer applying it:
  // which side the card is built on, and what the map is told to do.
  it('hangs the card below a centred marker and moves nothing', () => {
    const { stub, layer } = setup()
    expect(layer.openPopup(RAINIER)).toEqual({ dx: 0, dy: 0 })
    expect(popups).toHaveLength(1)
    expect(popups[0].options).toMatchObject({ anchor: 'top', closeOnClick: false })
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([])
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

  it('pans by what the fit asked for on a marker click, marker and card together', () => {
    const { stub } = setup([ADAMS, RAINIER], { x: 640, y: 40 })
    stub.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2))
    expect(stub.calls.filter((c) => c[0] === 'panBy')).toEqual([])
    stub.calls.length = 0
    const { stub: low } = setup([ADAMS, RAINIER], { x: 640, y: 880 })
    low.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2))
    // Above the marker fits whole, so no pan; a marker over the sheet does need one.
    expect(low.calls.filter((c) => c[0] === 'panBy')).toEqual([])
    const { stub: buried, controller } = setup([ADAMS, RAINIER], { x: 640, y: 880 })
    controller.update({ ...controller.inputs, cameraPadBottomPx: 500 })
    buried.fire('click', RESULT_MARKER_LAYER, markerClick(RAINIER, 2))
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

  it('points over a marker and hands the cursor back on leaving', () => {
    const { stub, restCursor } = setup()
    stub.fire('mouseenter', RESULT_MARKER_LAYER)
    expect(stub.canvas.style.cursor).toBe('pointer')
    stub.fire('mouseleave', RESULT_MARKER_LAYER)
    expect(restCursor).toHaveBeenCalledTimes(1)
  })
})

describe('makeArrowImage', () => {
  // Null rather than a throw: the caller skips the image and the map draws on.
  it('returns null where the canvas has no 2D context', () => {
    expect(makeArrowImage()).toBeNull()
  })
})
