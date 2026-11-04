import { afterEach, describe, expect, it, vi } from 'vitest'

// MapLibre needs a DOM, which neither loads in node; the modules whose ids
// this reads import it. Hoisted, because `vi.mock` runs before the imports.
vi.mock('maplibre-gl', () => ({ Popup: class {}, addProtocol: vi.fn() }))

import type * as maplibregl from 'maplibre-gl'
import { SLOTS, addLayerAt, beneathFor, slotOf, slotsOf, type StyleLayerRef } from './layerOrder'
import { TRAIL_CASING_LAYER, TRAIL_LAYER } from './basemap'
import { PENDING_MARKER_LAYER, RESULT_MARKER_LAYER } from './resultsLayer'
import {
  CONTOUR_CASING_LAYER,
  CONTOUR_INDEX_LAYER,
  CONTOUR_LABEL_LAYER,
  CONTOUR_LAYER,
  CREDIT_LAYER,
  RELIEF_LAYER,
  SLOPE_LAYER,
} from './terrain'
import { CLOSURE_AREA_FILL_LAYER, CLOSURE_TRAIL_LINE_LAYER, CLOSURE_TRAIL_SITE_LAYER } from './overlays/closures'
import { FIRE_ACTIVITY_LAYER } from './overlays/fireActivity'
import { IMAGERY_EOX, IMAGERY_USGS } from './overlays/imagery'
import { WILDFIRE_FILL_LAYER } from './overlays/wildfires'
import { LAKE_LAYERS, PLACE_LAYERS } from '../utils/basemapPoi'
import { LANDMARK_LAYERS } from '../utils/landmarks'
import { radarLayerId, radarOffsets } from '../utils/radar'
import { SMOKE_DENSITIES, smokeLayerId } from '../utils/smoke'
import { SNOW_LAYER_ID } from '../utils/snowDepth'
import { stubMap } from '../testSupport/stubMap'
// Liberty's layer list as OpenFreeMap served it on 2026-10-27, cut to each
// layer's id, type, source and source layer.
import liberty from './overlays/fixtures/liberty-layers.json'

afterEach(() => {
  vi.unstubAllEnvs()
})

// A layer of the app's, as far as the stack reads it.
const app = (id: string): StyleLayerRef => ({ id, type: '' })

// A Liberty in miniature: its ground, a road with its one-way arrows over it
// and a bridge over those, then its labels.
const BACKGROUND = { id: 'background', type: 'background' }
const WATER = { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water' }
const ROAD = { id: 'road_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' }
const ARROW = { id: 'road_one_way_arrow', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation' }
const BRIDGE = { id: 'bridge_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation' }
const ROAD_LABEL = { id: 'road_label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name' }
const CITY = { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place' }
const STYLE = [BACKGROUND, WATER, ROAD, ARROW, BRIDGE, ROAD_LABEL, CITY]

const add = (map: maplibregl.Map, id: string) =>
  addLayerAt(map, { id, type: 'fill', source: 'x' } as maplibregl.LayerSpecification)

describe('the slots', () => {
  // The maintainer's order (2026-11-03, record 0268), bottom to top. A change
  // here is a decision about what draws over what.
  it('rank every layer from the ground to the result markers', () => {
    expect(SLOTS).toEqual([
      'ground',
      'imagery',
      'roads',
      'relief',
      'slope',
      'contours',
      'trails',
      'grid',
      'snow',
      'radar',
      'smoke',
      'closure-areas',
      'wildfires',
      'closure-trails',
      'grid-wind',
      'hotspots',
      'contour-labels',
      'poi-labels',
      'labels',
      'landmarks',
      'ring',
      'pending',
      'results',
    ])
  })

  // Read off each module's own ids, so a renamed constant fails here as well
  // as in its module's tests, where `addLayerAt` refuses it.
  it('name every layer the modules export', () => {
    const want: [string, string][] = [
      [IMAGERY_EOX, 'imagery'],
      [IMAGERY_USGS, 'imagery'],
      [CREDIT_LAYER, 'relief'],
      [RELIEF_LAYER, 'relief'],
      [SLOPE_LAYER, 'slope'],
      [CONTOUR_CASING_LAYER, 'contours'],
      [CONTOUR_LAYER, 'contours'],
      [CONTOUR_INDEX_LAYER, 'contours'],
      [TRAIL_CASING_LAYER, 'trails'],
      [TRAIL_LAYER, 'trails'],
      [SNOW_LAYER_ID, 'snow'],
      ...radarOffsets().map((offset): [string, string] => [radarLayerId(offset), 'radar']),
      ...SMOKE_DENSITIES.map((density): [string, string] => [smokeLayerId(density), 'smoke']),
      [CLOSURE_AREA_FILL_LAYER, 'closure-areas'],
      [WILDFIRE_FILL_LAYER, 'wildfires'],
      [CLOSURE_TRAIL_LINE_LAYER, 'closure-trails'],
      [CLOSURE_TRAIL_SITE_LAYER, 'closure-trails'],
      [FIRE_ACTIVITY_LAYER, 'hotspots'],
      [CONTOUR_LABEL_LAYER, 'contour-labels'],
      ...['ofm-peaks', ...LAKE_LAYERS].flatMap((id): [string, string][] => [
        [id, 'poi-labels'],
        [`${id}-glow`, 'poi-labels'],
      ]),
      ...LANDMARK_LAYERS.flatMap((id): [string, string][] => [
        [id, 'landmarks'],
        [`${id}-glow`, 'landmarks'],
      ]),
      [PENDING_MARKER_LAYER, 'pending'],
      [RESULT_MARKER_LAYER, 'results'],
    ]
    expect(want.map(([id]) => [id, slotOf(id)])).toEqual(want)
  })

  // The style's place labels are the style's, sorted with its labels by
  // where they stand.
  it('leave the style\'s own layers to the style', () => {
    for (const id of PLACE_LAYERS) expect(slotOf(id)).toBeUndefined()
  })
})

describe('slotsOf', () => {
  // The basemap's last run of symbols is its labels, and the arrows among its
  // roads are ground, or every overlay would go under the bridge over them.
  it('sorts the basemap by where its layers stand, and the app\'s by id, in any order', () => {
    const stack = [
      BACKGROUND,
      WATER,
      ROAD,
      app(RESULT_MARKER_LAYER),
      ARROW,
      app('smoke-fill-Light'),
      BRIDGE,
      ROAD_LABEL,
      app('forecast-grid-fill'),
      CITY,
    ]
    expect(slotsOf(stack)).toEqual([
      'ground',
      'ground',
      'roads',
      'results',
      'roads',
      'smoke',
      'roads',
      'labels',
      'grid',
      'labels',
    ])
  })

  // Liberty's real list: the photos' split falls between `aeroway_fill` and
  // `aeroway_runway` (record 0250), the park outline goes under them with the
  // fills it stands between, and the buildings stand over them.
  it('splits Liberty\'s ground where the imagery goes and its labels at its last line', () => {
    const sorted = slotsOf(liberty)
    const slots = new Map(liberty.map((layer, i) => [layer.id, sorted[i]] as const))
    expect(['park_outline', 'aeroway_fill'].map((id) => slots.get(id))).toEqual(['ground', 'ground'])
    expect(
      ['aeroway_runway', 'road_minor', 'road_one_way_arrow', 'building', 'boundary_disputed'].map((id) =>
        slots.get(id),
      ),
    ).toEqual(['roads', 'roads', 'roads', 'roads', 'roads'])
    expect(['waterway_line_label', 'label_city'].map((id) => slots.get(id))).toEqual(['labels', 'labels'])
  })
})

describe('beneathFor', () => {
  it('names the first layer from a higher slot, wherever it stands', () => {
    const stack = [BACKGROUND, WATER, ROAD, app(RESULT_MARKER_LAYER), ARROW, app('smoke-fill-Light'), BRIDGE, ROAD_LABEL, CITY]
    expect(beneathFor(stack, 'imagery')).toBe('road_minor')
    expect(beneathFor(stack, 'radar')).toBe(RESULT_MARKER_LAYER)
    expect(beneathFor(stack, 'results')).toBeUndefined()
  })

  it('puts the imagery over Liberty\'s last ground fill under its first road, and every overlay over its bridges', () => {
    expect(beneathFor(liberty, 'imagery')).toBe('aeroway_runway')
    expect(beneathFor(liberty, 'grid')).toBe('waterway_line_label')
    expect(beneathFor(liberty, 'landmarks')).toBeUndefined()
  })

  it('stays under the first layer that is not the basemap\'s, and names the top past the ground alone', () => {
    expect(beneathFor([BACKGROUND, { id: TRAIL_LAYER, type: 'line', source: 'openmaptiles' }], 'imagery')).toBe(TRAIL_LAYER)
    expect(beneathFor([BACKGROUND, { id: 'road_label', type: 'symbol' }], 'imagery')).toBe('road_label')
    expect(beneathFor([BACKGROUND], 'imagery')).toBeUndefined()
    expect(beneathFor([], 'imagery')).toBeUndefined()
  })
})

describe('addLayerAt', () => {
  // One layer from each of most slots, the order they come out in.
  const SORTED = [
    'background',
    'water',
    IMAGERY_EOX,
    'road_minor',
    'road_one_way_arrow',
    'bridge_minor',
    RELIEF_LAYER,
    SLOPE_LAYER,
    CONTOUR_LAYER,
    TRAIL_LAYER,
    'forecast-grid-fill',
    SNOW_LAYER_ID,
    'radar-50',
    'smoke-fill-Light',
    CLOSURE_AREA_FILL_LAYER,
    WILDFIRE_FILL_LAYER,
    CLOSURE_TRAIL_LINE_LAYER,
    'forecast-grid-wind',
    FIRE_ACTIVITY_LAYER,
    CONTOUR_LABEL_LAYER,
    'ofm-peaks',
    'road_label',
    'label_city',
    'landmark-crags',
    'draw-fill',
    PENDING_MARKER_LAYER,
    RESULT_MARKER_LAYER,
  ]
  const APP = SORTED.filter((id) => slotOf(id) !== undefined)

  // Whatever order the layers are added in, by mount or by a switch, they
  // come out in slot order over the style.
  it('stacks the same whatever order the layers go on in', () => {
    const shuffled = [
      RESULT_MARKER_LAYER,
      RELIEF_LAYER,
      'radar-50',
      'ofm-peaks',
      IMAGERY_EOX,
      'smoke-fill-Light',
      'landmark-crags',
      'forecast-grid-fill',
      CONTOUR_LABEL_LAYER,
      SNOW_LAYER_ID,
      'draw-fill',
      TRAIL_LAYER,
      CLOSURE_TRAIL_LINE_LAYER,
      SLOPE_LAYER,
      FIRE_ACTIVITY_LAYER,
      PENDING_MARKER_LAYER,
      WILDFIRE_FILL_LAYER,
      CONTOUR_LAYER,
      'forecast-grid-wind',
      CLOSURE_AREA_FILL_LAYER,
    ]
    expect([...shuffled].sort()).toEqual([...APP].sort())
    for (const order of [APP, [...APP].reverse(), shuffled]) {
      const stub = stubMap({ styleLayers: STYLE })
      for (const id of order) add(stub.map, id)
      expect(stub.stack).toEqual(SORTED)
    }
  })

  // The rain radar painted over every name on the map (2026-11-03). A frame
  // switched on last lands over the snow, under the smoke and under every
  // label.
  it('puts a radar frame switched on last under the smoke and over the snow', () => {
    const stub = stubMap({ styleLayers: STYLE })
    for (const id of ['forecast-grid-fill', 'smoke-fill-Light', WILDFIRE_FILL_LAYER, 'draw-fill', RESULT_MARKER_LAYER]) {
      add(stub.map, id)
    }
    add(stub.map, SNOW_LAYER_ID)
    add(stub.map, 'radar-50')
    expect(stub.calls[stub.calls.length - 1]).toEqual(['addLayer', 'radar-50', 'smoke-fill-Light'])
    const at = stub.stack.indexOf('radar-50')
    expect(stub.stack.slice(at - 2, at + 2)).toEqual(['forecast-grid-fill', SNOW_LAYER_ID, 'radar-50', 'smoke-fill-Light'])
    expect(stub.stack.indexOf('radar-50')).toBeLessThan(stub.stack.indexOf('road_label'))
  })

  // Over every label of the basemap's, so MapLibre places a ranked name before
  // any of them in collision.
  it('puts the result markers over the basemap\'s labels', () => {
    const stub = stubMap({ styleLayers: STYLE })
    add(stub.map, RESULT_MARKER_LAYER)
    add(stub.map, 'ofm-peaks')
    expect(stub.stack.slice(-4)).toEqual(['ofm-peaks', 'road_label', 'label_city', RESULT_MARKER_LAYER])
  })

  // Inside a slot each goes in at the top, so a module's own order holds: a
  // fill under its outline, a halo under its dot.
  it('keeps the order a module adds a slot\'s layers in', () => {
    const stub = stubMap({ styleLayers: STYLE })
    add(stub.map, 'draw-fill')
    for (const id of ['results-halo', RESULT_MARKER_LAYER, 'results-labels']) add(stub.map, id)
    expect(stub.stack.slice(-5)).toEqual(['label_city', 'draw-fill', 'results-halo', RESULT_MARKER_LAYER, 'results-labels'])
  })

  // A layer with no slot cannot go on unranked while the app is built for
  // development, which every test runs as.
  it('refuses a layer with no slot in development', () => {
    const stub = stubMap({ styleLayers: STYLE })
    expect(() => add(stub.map, 'mystery-fill')).toThrow(/mystery-fill/)
    expect(stub.stack).toEqual(STYLE.map((l) => l.id))
  })

  // In production the map keeps the layer, on top, where it went before.
  it('puts a layer with no slot on top in production', () => {
    vi.stubEnv('DEV', false)
    const stub = stubMap({ styleLayers: STYLE })
    add(stub.map, 'mystery-fill')
    expect(stub.calls).toEqual([['addLayer', 'mystery-fill', undefined]])
  })
})
