import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// MapLibre's Popup needs a DOM. This one records where it opened, what it says
// and its options, and fires `close` when removed, as MapLibre's does.
// Hoisted, because `vi.mock` runs before the imports.
const { popups } = vi.hoisted(() => ({
  popups: [] as { at: unknown; html: string; options: unknown; removed: boolean }[],
}))
vi.mock('maplibre-gl', () => ({
  Popup: class {
    state: { at: unknown; html: string; options: unknown; removed: boolean }
    closers: (() => void)[] = []
    constructor(options: unknown) {
      this.state = { at: null, html: '', options, removed: false }
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
import { createMapController, type MapInputs } from './controller'
import { createPopupBoard } from './popups'
import { pendingFC } from '../utils/mapFeatures'
import { resultPopupHtml } from '../utils/resultPopup'
import { resultsFeatureCollection } from '../utils/resultFeatures'
import { resultRow } from '../testSupport/fixtures'
import { stubMap } from '../testSupport/stubMap'

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

function setup(results = [ADAMS, RAINIER]) {
  const stub = stubMap({ canvasWidth: 1280 })
  const inputs: MapInputs = {
    drawing: false,
    results,
    modelId: 'gfs_seamless',
    times: [],
    modelFallbackLabel: null,
    popupColumns: [],
    fireWarnings: new Map(),
    searchedPlaces: [],
    onAddPoi: vi.fn(),
    onRemovePoi: vi.fn(),
    cameraPadBottomPx: 0,
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
