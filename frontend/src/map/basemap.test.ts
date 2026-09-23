import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import {
  enhanceBasemap,
  glowTwin,
  isPinning,
  lakeAnchor,
  makeArrowImage,
  poiLabelLayout,
  POI_GLOW_IMAGE,
  popupOptions,
  setSource,
  updateResults,
} from './basemap'
// The `?raw` idiom `MapView.test.ts` uses, for the one rule here that is about
// the file rather than about what its functions return.
import basemapSource from './basemap.ts?raw'
import { POI_LAYERS, LAKE_CLASS } from '../utils/basemapPoi'
import { popupWidth } from '../utils/popupChrome'
import { resultsFeatureCollection } from '../utils/resultFeatures'
import { resultRow } from '../testSupport/fixtures'
import { stubMap } from '../testSupport/stubMap'

/**
 * The functions this file may declare at the top level, carried over from the
 * list `MapView.test.ts` kept while they lived in the component. Each earns its
 * place by needing a map, a canvas or an event. A new name here is the question
 * "can this be plain data in and plain data out?" If it can, it belongs in
 * `utils/` with a test, not in the map's module.
 */
const ALLOWED: Record<string, string> = {
  // Read or drive the map itself.
  enhanceBasemap: 'patches the loaded style',
  lakeAnchor: 'queries what the map has drawn',
  setSource: 'sets a source on the map',
  popupOptions: 'measures the canvas',
  updateResults: 'sets a source on the map',
  // Build an image, or read a browser event.
  makeGlowImage: 'draws on a canvas',
  makeArrowImage: 'draws on a canvas',
  isPinning: 'reads the modifier off a DOM event',
  // Return a MapLibre style spec: a declaration of how a layer draws, which
  // belongs beside the `addLayer` call that takes it rather than in a module of
  // its own.
  poiLabelLayout: 'builds a layer layout',
  glowTwin: 'builds a layer spec from another layer spec',
}

describe('map/basemap.ts declares only what needs a map, a canvas or an event', () => {
  it('declares exactly the allowed helpers', () => {
    const declared = [...basemapSource.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)]
      .map((m) => m[1])
      .sort()
    expect(declared).toEqual(Object.keys(ALLOWED).sort())
  })
})

// The node project has no DOM. A canvas with no 2D context is what a browser
// without one hands back, and it is the branch every image builder here has to
// survive, so it is the one the suite can reach.
beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => null }),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('enhanceBasemap', () => {
  const styleLayers = [
    { id: 'background', type: 'background' },
    { id: 'water', type: 'fill' },
    { id: 'road_label', type: 'symbol' },
    { id: 'water_name_point_label', type: 'symbol' },
  ]

  // The order the layers go on in is the order they draw in, and every one of
  // them goes under the style's first label so names stay on top of lines and
  // fills. Each clickable label goes on with its halo directly below it.
  it('adds its layers in one fixed order beneath the first label', () => {
    const { map, calls } = stubMap({ styleLayers })
    enhanceBasemap(map)
    const added = calls.filter((c) => c[0] === 'addLayer')
    expect(added).toEqual([
      ['addLayer', 'ofm-trails', 'road_label'],
      ['addLayer', 'ofm-peaks-glow', 'road_label'],
      ['addLayer', 'ofm-peaks', 'road_label'],
      ['addLayer', 'ofm-lakes-glow', 'road_label'],
      ['addLayer', 'ofm-lakes', 'road_label'],
      ['addLayer', 'ofm-lakes-line-glow', 'road_label'],
      ['addLayer', 'ofm-lakes-line', 'road_label'],
    ])
  })

  it('adds every layer the click handler reads', () => {
    const { map, calls } = stubMap({ styleLayers })
    enhanceBasemap(map)
    const added = calls.filter((c) => c[0] === 'addLayer').map((c) => c[1])
    for (const id of POI_LAYERS) expect(added).toContain(id)
  })

  // Composed onto the style's own filter, so a style update that narrows the
  // layer is not undone here, and skipped where the style has no such layer.
  it('takes lakes off the style labels without replacing their filter', () => {
    const existing = ['==', ['get', 'kind'], 'x']
    const { map, calls } = stubMap({
      styleLayers,
      layers: ['water_name_point_label', 'water_name_line_label'],
      filters: { water_name_point_label: existing },
    })
    enhanceBasemap(map)
    const notOurs = ['!=', ['get', 'class'], LAKE_CLASS]
    expect(calls.filter((c) => c[0] === 'setFilter')).toEqual([
      ['setFilter', 'water_name_point_label', ['all', existing, notOurs]],
      ['setFilter', 'water_name_line_label', notOurs],
    ])
  })

  it('leaves a style without the label layers alone', () => {
    const { map, calls } = stubMap({
      styleLayers: styleLayers.filter((l) => !l.id.startsWith('water_name')),
    })
    enhanceBasemap(map)
    expect(calls.filter((c) => c[0] === 'setFilter')).toEqual([])
  })

  // MapLibre draws nothing for an unknown icon and only warns, so a canvas
  // that cannot draw the glow must cost the glow and nothing else.
  it('adds the layers even when no glow image can be drawn', () => {
    const { map, calls } = stubMap({ styleLayers })
    enhanceBasemap(map)
    expect(calls.filter((c) => c[0] === 'addImage')).toEqual([])
    expect(calls.filter((c) => c[0] === 'addLayer')).toHaveLength(7)
  })
})

describe('glowTwin', () => {
  const lake: maplibregl.SymbolLayerSpecification = {
    id: 'ofm-lakes-line',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'water_name',
    minzoom: 9,
    filter: ['==', ['get', 'class'], 'lake'],
    layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'name'] },
  }

  it('lights the same features as the label it belongs to', () => {
    const twin = glowTwin(lake)
    expect(twin.id).toBe('ofm-lakes-line-glow')
    expect(twin.source).toBe(lake.source)
    expect(twin['source-layer']).toBe(lake['source-layer'])
    expect(twin.minzoom).toBe(lake.minzoom)
    expect(twin.filter).toEqual(lake.filter)
    expect(twin.layout?.['symbol-placement']).toBe('line-center')
  })

  it('draws the glow hidden, with no text, outside collision', () => {
    const layout = glowTwin(lake).layout!
    expect(layout['icon-image']).toBe(POI_GLOW_IMAGE)
    expect(layout['icon-ignore-placement']).toBe(true)
    expect(layout.visibility).toBe('none')
    expect('text-field' in layout).toBe(false)
  })

  // MapLibre rejects an explicit `filter: undefined`, and the peaks layer has
  // no filter at all.
  it('carries no filter key when the label has none', () => {
    const { filter: _filter, ...peaks } = lake
    expect('filter' in glowTwin({ ...peaks, layout: {} })).toBe(false)
    expect('symbol-placement' in glowTwin({ ...peaks, layout: {} }).layout!).toBe(false)
  })
})

describe('poiLabelLayout', () => {
  it('keeps every marker and drops only the text when labels collide', () => {
    const layout = poiLabelLayout('mountain_11')!
    expect(layout['icon-image']).toBe('mountain_11')
    expect(layout['icon-allow-overlap']).toBe(true)
    expect(layout['text-optional']).toBe(true)
  })
})

describe('isPinning', () => {
  it('pins on shift and on nothing else', () => {
    expect(isPinning({ originalEvent: { shiftKey: true } })).toBe(true)
    expect(isPinning({ originalEvent: { shiftKey: false } })).toBe(false)
    expect(isPinning({})).toBe(false)
  })
})

describe('popupOptions', () => {
  it('sizes a popup from the canvas it opens on', () => {
    for (const width of [320, 1280]) {
      const { map } = stubMap({ canvasWidth: width })
      expect(popupOptions(map)).toEqual({ maxWidth: popupWidth(width) })
    }
  })
})

describe('setSource and updateResults', () => {
  it('sets data on a source that exists and ignores one that does not', () => {
    const setData = vi.fn()
    const { map } = stubMap({ sources: { draw: { setData } } })
    setSource(map, 'draw', { type: 'FeatureCollection', features: [] })
    setSource(map, 'missing', { type: 'FeatureCollection', features: [] })
    expect(setData).toHaveBeenCalledTimes(1)
  })

  it('draws the ranked markers the results table ranks', () => {
    const setData = vi.fn()
    const { map } = stubMap({ sources: { results: { setData } } })
    const rows = [resultRow(), resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.5 })]
    updateResults(map, rows, 'precip_total_in', 2)
    expect(setData).toHaveBeenCalledWith(resultsFeatureCollection(rows, 'precip_total_in', true, 2))
  })
})

describe('lakeAnchor', () => {
  const click = { x: 0, y: 0 } as maplibregl.Point
  const fallback: [number, number] = [9, 9]
  const square = {
    properties: { id: 7 },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    },
  }

  it('falls back when the style has no water fill', () => {
    const { map } = stubMap({ rendered: () => [square] })
    expect(lakeAnchor(map, click, fallback)).toEqual(fallback)
  })

  it('falls back when no water is under the click', () => {
    const { map } = stubMap({ layers: ['water'] })
    expect(lakeAnchor(map, click, fallback)).toEqual(fallback)
  })

  it('centres on the drawn water the click landed in', () => {
    const { map } = stubMap({ layers: ['water'], rendered: () => [square] })
    const [lon, lat] = lakeAnchor(map, click, fallback)
    expect(lon).toBeCloseTo(1, 1)
    expect(lat).toBeCloseTo(1, 1)
  })
})

describe('the canvas images', () => {
  // Null rather than a throw: the caller skips the image and the map draws on.
  it('return null where the canvas has no 2D context', () => {
    expect(makeArrowImage()).toBeNull()
  })
})
