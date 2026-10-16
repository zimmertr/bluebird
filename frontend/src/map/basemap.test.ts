import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import {
  CLIMBING_IMAGE,
  enhanceBasemap,
  glowTwin,
  lakeAnchor,
  poiLabelLayout,
  POI_GLOW_IMAGE,
  setSource,
  townMarker,
} from './basemap'
import { CLIMBING_CLASS, POI_LAYERS, LAKE_CLASS, PLACE_LAYERS } from '../utils/basemapPoi'
import { stubMap } from '../testSupport/stubMap'

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
      ['addLayer', 'ofm-climbing-glow', 'road_label'],
      ['addLayer', 'ofm-climbing', 'road_label'],
    ])
  })

  // The place labels are the style's own: the map adds their glow, not them.
  it('adds every layer the click handler reads that the style does not carry', () => {
    const { map, calls } = stubMap({ styleLayers })
    enhanceBasemap(map)
    const added = calls.filter((c) => c[0] === 'addLayer').map((c) => c[1])
    for (const id of POI_LAYERS) {
      if ((PLACE_LAYERS as readonly string[]).includes(id)) expect(added).not.toContain(id)
      else expect(added).toContain(id)
    }
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

  // The style's `poi` labels draw a climbing feature from z15 with no icon
  // (the sprite has none), under the one `ofm-climbing` draws from z14.
  it('takes climbing off the style\'s poi labels without replacing their filter', () => {
    const rank = ['>=', ['get', 'rank'], 20]
    const { map, calls } = stubMap({
      styleLayers,
      layers: ['poi_r1', 'poi_r7', 'poi_r20'],
      filters: { poi_r20: rank },
    })
    enhanceBasemap(map)
    const notOurs = ['!=', ['get', 'class'], CLIMBING_CLASS]
    expect(calls.filter((c) => c[0] === 'setFilter' && String(c[1]).startsWith('poi_'))).toEqual([
      ['setFilter', 'poi_r1', notOurs],
      ['setFilter', 'poi_r7', notOurs],
      ['setFilter', 'poi_r20', ['all', rank, notOurs]],
    ])
  })

  // Named features only, as points, of the one class, from the zoom the
  // tiles' `poi` layer is complete at, with a glow that lights the same set.
  it('draws the named climbing features from z14, with a twin of the same filter', () => {
    const added: Record<string, { filter?: unknown; minzoom?: number; layout?: Record<string, unknown> }> = {}
    const { map } = stubMap({ styleLayers })
    const addLayer = map.addLayer.bind(map)
    map.addLayer = ((layer: (typeof added)[string] & { id: string }, before?: string) => {
      added[layer.id] = layer
      return addLayer(layer as never, before)
    }) as typeof map.addLayer
    enhanceBasemap(map)
    const climbing = added['ofm-climbing']
    expect(climbing.minzoom).toBe(14)
    expect(climbing.filter).toEqual([
      'all',
      ['==', ['get', 'class'], CLIMBING_CLASS],
      ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false],
      ['has', 'name'],
    ])
    // No 2D canvas here, so the sprite's circle stands in for the drawn climber.
    expect(climbing.layout?.['icon-image']).toBe('circle_stroked_11')
    // Routes on one wall pile up at z14, so climbing alone lets collision
    // hide icons; every other clickable layer keeps each marker.
    expect(climbing.layout?.['icon-allow-overlap']).toBe(false)
    expect(added['ofm-peaks'].layout?.['icon-allow-overlap']).toBe(true)
    expect(added['ofm-climbing-glow'].filter).toEqual(climbing.filter)
    expect(added['ofm-climbing-glow'].minzoom).toBe(14)
  })

  // The peak layer's source also holds cliffs and ridges, most of them with
  // no name and no elevation, which a click cannot turn into a destination.
  // Only a feature with a name, or an elevation to call it `Peak 2562`, draws,
  // and its glow lights the same set.
  it('draws only the peak-layer features a click can add', () => {
    const added: Record<string, { filter?: unknown }> = {}
    const { map } = stubMap({ styleLayers })
    const addLayer = map.addLayer.bind(map)
    map.addLayer = ((layer: (typeof added)[string] & { id: string }, before?: string) => {
      added[layer.id] = layer
      return addLayer(layer as never, before)
    }) as typeof map.addLayer
    enhanceBasemap(map)
    const filter = ['any', ['has', 'name'], ['has', 'ele_ft']]
    expect(added['ofm-peaks'].filter).toEqual(filter)
    expect(added['ofm-peaks-glow'].filter).toEqual(filter)
  })

  it('leaves a style without the label layers alone', () => {
    const { map, calls } = stubMap({
      styleLayers: styleLayers.filter((l) => !l.id.startsWith('water_name')),
    })
    enhanceBasemap(map)
    expect(calls.filter((c) => c[0] === 'setFilter')).toEqual([])
  })

  // The climbing points wear the drawn climber (#715) at the sprite's @2x
  // size, so it stands at the 17px the peak's icon does. The canvas here is a
  // recorder: what matters is that a drawable icon is registered before the
  // layer names it, and that the rock and the climber are both drawn.
  it('registers the climber icon at pixel ratio 2 and draws climbing with it', () => {
    const drawn: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, key: string) =>
        key === 'getImageData'
          ? () => ({ width: 34, height: 34, data: new Uint8ClampedArray(34 * 34 * 4) })
          : key === 'createRadialGradient'
            ? () => ({ addColorStop: () => {} })
            : (...args: unknown[]) => drawn.push(`${key}:${args.length}`),
      set: () => true,
    })
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) })
    vi.stubGlobal('Path2D', class { constructor(public d: string) {} })
    const images: [string, unknown][] = []
    const added: Record<string, { layout?: Record<string, unknown> }> = {}
    const { map } = stubMap({ styleLayers })
    map.addImage = ((id: string, _img: unknown, opts?: unknown) => images.push([id, opts])) as unknown as typeof map.addImage
    const addLayer = map.addLayer.bind(map)
    map.addLayer = ((layer: (typeof added)[string] & { id: string }, before?: string) => {
      added[layer.id] = layer
      return addLayer(layer as never, before)
    }) as typeof map.addLayer
    enhanceBasemap(map)
    expect(images).toContainEqual([CLIMBING_IMAGE, { pixelRatio: 2 }])
    expect(added['ofm-climbing'].layout?.['icon-image']).toBe(CLIMBING_IMAGE)
    // The rock is filled from a path and the climber's limbs stroked from one.
    expect(drawn).toContain('fill:1')
    expect(drawn).toContain('stroke:1')
  })

  // MapLibre draws nothing for an unknown icon and only warns, so a canvas
  // that cannot draw the glow must cost the glow and nothing else.
  it('adds the layers even when no glow image can be drawn', () => {
    const { map, calls } = stubMap({ styleLayers })
    enhanceBasemap(map)
    expect(calls.filter((c) => c[0] === 'addImage')).toEqual([])
    expect(calls.filter((c) => c[0] === 'addLayer')).toHaveLength(9)
  })
})

// The style's place labels as Liberty spells them (read 2026-10-15), each
// clickable where the style draws it (#710).
// Liberty's settlement layout, as read 2026-10-15: the dot is a zoom step, so
// it cannot be nested in the app's own step.
function settlementLayout(size: number, dotUntil = 10) {
  return {
    'icon-image': ['step', ['zoom'], 'circle_11_black', dotUntil, ''],
    'icon-size': size,
    'text-anchor': 'bottom',
  }
}

describe('enhanceBasemap on the style\'s place labels', () => {
  const settlements = ['match', ['get', 'class'], ['city', 'town', 'village', 'hamlet'], true, false]
  const other = ['match', ['get', 'class'], ['city', 'continent', 'country', 'state', 'town', 'village'], false, true]
  const town = ['==', ['get', 'class'], 'town']
  const placeLayers = [
    { id: 'road_label', type: 'symbol' },
    { id: 'label_other', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 8, filter: other, layout: {} },
    { id: 'label_village', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 9, filter: ['==', ['get', 'class'], 'village'], layout: settlementLayout(0.2) },
    { id: 'label_town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 6, filter: town, layout: settlementLayout(0.2) },
    { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 3, layout: { ...settlementLayout(0.4, 9), 'text-offset': [0, -0.1] } },
  ]

  it('puts a hidden glow directly beneath each place label the style carries', () => {
    const { map, stack } = stubMap({ styleLayers: placeLayers })
    enhanceBasemap(map)
    for (const id of ['label_other', 'label_village', 'label_town', 'label_city']) {
      expect(stack.indexOf(`${id}-glow`)).toBe(stack.indexOf(id) - 1)
    }
  })

  // A Liberty update that drops or renames one costs that target, not the map.
  it('skips a place layer the style does not carry', () => {
    const { map, calls } = stubMap({ styleLayers: placeLayers })
    enhanceBasemap(map)
    const added = calls.filter((c) => c[0] === 'addLayer').map((c) => c[1])
    expect(added).not.toContain('label_city_capital-glow')
    expect(added).toContain('label_city-glow')
  })

  // `label_other` labels hamlets and also suburbs, neighbourhoods and islands,
  // which a click refuses, so its glow lights the settlements alone.
  it('composes the settlement classes onto the style\'s own filter', () => {
    const added: Record<string, { filter?: unknown; minzoom?: number }> = {}
    const { map } = stubMap({ styleLayers: placeLayers })
    const addLayer = map.addLayer.bind(map)
    map.addLayer = ((layer: { id: string; filter?: unknown; minzoom?: number }, before?: string) => {
      added[layer.id] = layer
      return addLayer(layer as never, before)
    }) as typeof map.addLayer
    enhanceBasemap(map)
    expect(added['label_other-glow'].filter).toEqual(['all', other, settlements])
    expect(added['label_town-glow'].filter).toEqual(['all', town, settlements])
    expect(added['label_city-glow'].filter).toEqual(settlements)
    expect(added['label_other-glow'].minzoom).toBe(8)
  })

  // From POI_MINZOOM a clickable settlement wears a disc; below it the
  // style's own dot stays, and a layer the style lacks is skipped.
  it('steps each present place layer to the disc at POI_MINZOOM', () => {
    const { map, layout } = stubMap({ styleLayers: placeLayers })
    enhanceBasemap(map)
    for (const id of ['label_village', 'label_town', 'label_city']) {
      expect(layout[id]['icon-image']).toEqual(['step', ['zoom'], 'circle_11_black', 9, 'town_hall_11'])
      expect(layout[id]['text-anchor']).toEqual(['step', ['zoom'], 'bottom', 9, 'top'])
    }
    expect(layout.label_town['icon-size']).toEqual(['step', ['zoom'], 0.2, 9, 1])
    expect(layout.label_city['text-offset']).toEqual(['step', ['zoom'], ['literal', [0, -0.1]], 9, ['literal', [0, 0.7]]])
    expect(layout.label_town['text-offset']).toEqual(['step', ['zoom'], ['literal', [0, 0]], 9, ['literal', [0, 0.7]]])
    expect(layout.label_city_capital).toBeUndefined()
  })

  // `label_other` labels suburbs and islands too, which keep the style's look.
  it('gives label_other\'s disc to hamlets alone', () => {
    const { map, layout } = stubMap({ styleLayers: placeLayers })
    enhanceBasemap(map)
    const hamlet = (disc: unknown, own: unknown) => ['match', ['get', 'class'], 'hamlet', disc, own]
    expect(layout.label_other['icon-image']).toEqual(['step', ['zoom'], '', 9, hamlet('town_hall_11', '')])
    expect(layout.label_other['text-anchor']).toEqual(['step', ['zoom'], 'center', 9, hamlet('top', 'center')])
  })

  it('puts each glow under its place label, and so under the disc', () => {
    const { map, stack } = stubMap({ styleLayers: placeLayers })
    enhanceBasemap(map)
    expect(stack.indexOf('label_town-glow')).toBeLessThan(stack.indexOf('label_town'))
  })
})

describe('townMarker', () => {
  // A value that is itself an expression could hide a zoom input, which
  // MapLibre refuses inside a step, so such a layer keeps the style's look.
  it('leaves a layer alone when its size, anchor or offset is not a plain value', () => {
    const base = { id: 'label_town', type: 'symbol', source: 'openmaptiles', layout: settlementLayout(0.2) } as maplibregl.SymbolLayerSpecification
    expect(townMarker(base)).not.toBeNull()
    expect(townMarker({ ...base, layout: { ...base.layout, 'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.2, 9, 0.4] } } as maplibregl.SymbolLayerSpecification)).toBeNull()
    expect(townMarker({ ...base, layout: { ...base.layout, 'text-anchor': ['get', 'anchor'] } } as maplibregl.SymbolLayerSpecification)).toBeNull()
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

  // MapLibre rejects an explicit `filter: undefined`, so a label with no
  // filter gives its twin none.
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

describe('setSource', () => {
  it('sets data on a source that exists and ignores one that does not', () => {
    const setData = vi.fn()
    const { map } = stubMap({ sources: { draw: { setData } } })
    setSource(map, 'draw', { type: 'FeatureCollection', features: [] })
    setSource(map, 'missing', { type: 'FeatureCollection', features: [] })
    expect(setData).toHaveBeenCalledTimes(1)
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
