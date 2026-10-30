import { afterEach, describe, expect, it, vi } from 'vitest'

// MapLibre needs a DOM and the contour library a window, and neither loads in
// node. Hoisted, because `vi.mock` runs before the imports.
const { addProtocol, constructed, setupMaplibre } = vi.hoisted(() => ({
  addProtocol: vi.fn(),
  constructed: [] as unknown[],
  setupMaplibre: vi.fn(),
}))
vi.mock('maplibre-gl', () => ({ addProtocol }))
vi.mock('maplibre-contour', () => ({
  default: {
    DemSource: class {
      sharedDemProtocolUrl = 'bluebird-dem-shared://{z}/{x}/{y}'
      setupMaplibre = setupMaplibre
      constructor(options: unknown) {
        constructed.push(options)
      }
    },
  },
}))

import {
  CONTOUR_CASING_LAYER,
  CONTOUR_IMAGERY_EDGE,
  CONTOUR_IMAGERY_INK,
  CONTOUR_INDEX_LAYER,
  CONTOUR_LABEL_LAYER,
  CONTOUR_LAYER,
  CONTOUR_MINZOOM,
  CONTOUR_SOURCE,
  CONTOUR_THRESHOLDS_FT,
  MAPTERHORN_ATTRIBUTION,
  RELIEF_LAYER,
  RELIEF_SOURCE,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
  TERRAIN_SOURCE,
  SLOPE_LAYER,
  SLOPE_SOURCE,
  loadDemTiles,
  mountTerrain,
  reliefPaint,
  type DemTiles,
} from './terrain'
import { RELIEF_TILES, SLOPE_MAXZOOM, SLOPE_PAINT, SLOPE_SCHEME, SLOPE_SHADED_TILES, SLOPE_TILES } from './slope'
import { SLOPE_ALPHA } from '../utils/slopeAngle'
import { DEM_MAXZOOM, DEM_TILES } from '../utils/terrainSources'
import { FEET_PER_METER } from '../utils/basemapPoi'
import { stubMap } from '../testSupport/stubMap'

// The style as `enhanceBasemap` leaves it: Liberty's ground, the app's trails
// line under the first label, and the label.
const STYLE_LAYERS = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'road_minor', type: 'line' },
  { id: 'ofm-trails', type: 'line' },
  { id: 'road_one_way_arrow', type: 'symbol' },
  { id: 'label_city', type: 'symbol' },
]

const OFF = { relief: false, contours: false, terrain: false }

function setup({ pitch = 0, bearing = 0 } = {}) {
  const stub = stubMap({ styleLayers: STYLE_LAYERS, pitch, bearing })
  const contourUrl = vi.fn((o: unknown) => `bluebird-dem-contour://{z}/{x}/{y}?${JSON.stringify(o)}`)
  const tiles: DemTiles = {
    sharedDemProtocolUrl: 'bluebird-dem-shared://{z}/{x}/{y}',
    contourProtocolUrl: contourUrl,
    getDemTile: vi.fn(),
  }
  const load = vi.fn(async () => tiles)
  const terrain = mountTerrain(stub.map, { load })
  return { stub, terrain, load, contourUrl }
}

const sourcesAdded = (calls: unknown[][]) => calls.filter((c) => c[0] === 'addSource').map((c) => c[1])
const visibility = (stub: ReturnType<typeof stubMap>, id: string) => stub.layout[id]?.visibility

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mountTerrain', () => {
  // The cold load must not change: no source, no layer, no library.
  it('adds nothing and loads nothing on mount or while all three are off', async () => {
    const { stub, terrain, load } = setup()
    terrain.update(OFF)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(load).not.toHaveBeenCalled()
    expect(stub.calls).toEqual([])
    expect(stub.stack).toEqual(STYLE_LAYERS.map((l) => l.id))
  })

  // The relief goes in the first time it is asked for, as a raster of the
  // app's own scheme painted from the finest elevation, to the slope's zoom:
  // MapLibre's hillshade read a raster-dem source, which could not fall back
  // past a missing tile and so stopped at zoom 12.
  it('adds the relief as a raster of its own scheme, credited, the first time it is on', async () => {
    const { stub, terrain, load } = setup()
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.sources[RELIEF_SOURCE]).toBeDefined())
    expect(load).toHaveBeenCalledOnce()
    expect(sourcesAdded(stub.calls)).toEqual([RELIEF_SOURCE])
    expect(stub.calls.find((c) => c[0] === 'addSource')![2]).toEqual({
      type: 'raster',
      tiles: [RELIEF_TILES],
      tileSize: 512,
      maxzoom: SLOPE_MAXZOOM,
      attribution: MAPTERHORN_ATTRIBUTION,
    })
    expect(stub.paint[RELIEF_LAYER]['raster-opacity']).toBe(0.5)
  })

  // Under the trails, the peaks and every label: the first `ofm-` layer or
  // the first symbol, whichever comes first.
  it('puts the relief under the first ofm- layer and the first label', async () => {
    const { stub, terrain } = setup()
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.stack).toContain(RELIEF_LAYER))
    expect(stub.stack).toEqual(['background', 'water', 'road_minor', RELIEF_LAYER, 'ofm-trails', 'road_one_way_arrow', 'label_city'])
  })

  // Off hides; nothing is removed or added again, and a hidden layer asks
  // MapLibre for no tile.
  it('hides the relief when it is switched off and shows it again, adding nothing twice', async () => {
    const { stub, terrain, load } = setup()
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.stack).toContain(RELIEF_LAYER))
    terrain.update(OFF)
    expect(visibility(stub, RELIEF_LAYER)).toBe('none')
    terrain.update({ ...OFF, relief: true })
    expect(visibility(stub, RELIEF_LAYER)).toBe('visible')
    expect(load).toHaveBeenCalledOnce()
    expect(stub.calls.filter((c) => c[0] === 'addLayer')).toHaveLength(1)
    expect(stub.calls.some((c) => c[0] === 'removeLayer' || c[0] === 'removeSource')).toBe(false)
  })

  // The contours: two line layers and their labels, under the labels and over
  // the relief whichever is switched on first.
  it('stacks the contours over the relief and under the labels, either order', async () => {
    for (const order of [['relief', 'contours'], ['contours', 'relief']] as const) {
      const { stub, terrain } = setup()
      let want = OFF
      for (const key of order) {
        want = { ...want, [key]: true }
        terrain.update(want)
        await vi.waitFor(() => expect(stub.stack).toContain(key === 'relief' ? RELIEF_LAYER : CONTOUR_LAYER))
      }
      expect(stub.stack.slice(3, 9)).toEqual([
        RELIEF_LAYER,
        CONTOUR_CASING_LAYER,
        CONTOUR_LAYER,
        CONTOUR_INDEX_LAYER,
        CONTOUR_LABEL_LAYER,
        'ofm-trails',
      ])
    }
  })

  // In feet, from the shared elevation, on the thresholds this module pins.
  it('draws the contours in feet from the shared elevation, with the index lines labelled', async () => {
    const { stub, terrain, contourUrl } = setup()
    terrain.update({ ...OFF, contours: true })
    await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
    expect(contourUrl).toHaveBeenCalledWith(
      expect.objectContaining({ multiplier: FEET_PER_METER, thresholds: CONTOUR_THRESHOLDS_FT, elevationKey: 'ele', levelKey: 'level' }),
    )
    expect(sourcesAdded(stub.calls)).toEqual([CONTOUR_SOURCE])
    const spec = stub.calls.find((c) => c[0] === 'addSource')![2] as { type: string; attribution: string }
    expect([spec.type, spec.attribution]).toEqual(['vector', MAPTERHORN_ATTRIBUTION])
    terrain.update(OFF)
    for (const id of [CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER]) expect(visibility(stub, id)).toBe('none')
  })

  // Over the satellite imagery the brown vanishes on a forest, so the lines
  // turn light on a dark edge while the Satellite row is on, whichever comes
  // first, and back when it goes off.
  it('draws the contours light on a dark edge over the imagery, and brown again off it', async () => {
    const ink = (stub: ReturnType<typeof stubMap>) =>
      [CONTOUR_LAYER, CONTOUR_INDEX_LAYER].map((id) => [stub.paint[id]['line-color'], stub.paint[id]['line-opacity']])
    const brown = [
      ['#8a6a4a', 0.35],
      ['#8a6a4a', 0.6],
    ]
    for (const imageryFirst of [false, true]) {
      const { stub, terrain } = setup()
      if (imageryFirst) terrain.overImagery(true)
      terrain.update({ ...OFF, contours: true })
      await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
      if (!imageryFirst) {
        expect(ink(stub)).toEqual(brown)
        expect(visibility(stub, CONTOUR_CASING_LAYER)).toBe('none')
        terrain.overImagery(true)
      }
      expect(ink(stub)).toEqual([
        [CONTOUR_IMAGERY_INK, 0.7],
        [CONTOUR_IMAGERY_INK, 0.9],
      ])
      expect(stub.paint[CONTOUR_CASING_LAYER]['line-color']).toBe(CONTOUR_IMAGERY_EDGE)
      expect(visibility(stub, CONTOUR_CASING_LAYER)).toBe('visible')
      // The edge goes with the lines when the row is switched off under it.
      terrain.update(OFF)
      expect(visibility(stub, CONTOUR_CASING_LAYER)).toBe('none')
      terrain.update({ ...OFF, contours: true })
      expect(visibility(stub, CONTOUR_CASING_LAYER)).toBe('visible')
      terrain.overImagery(false)
      expect(ink(stub)).toEqual(brown)
      expect(visibility(stub, CONTOUR_CASING_LAYER)).toBe('none')
    }
  })

  // Before any contour is drawn the switch only remembers, and loads nothing.
  it('loads nothing for the imagery alone', async () => {
    const { stub, terrain, load } = setup()
    terrain.overImagery(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(load).not.toHaveBeenCalled()
    expect(stub.calls).toEqual([])
  })

  it('pins the contour intervals, in feet, every fifth an index line', () => {
    expect(CONTOUR_THRESHOLDS_FT).toEqual({
      8: [1000, 5000],
      9: [1000, 5000],
      10: [1000, 5000],
      11: [500, 2500],
      12: [200, 1000],
      13: [100, 500],
      14: [40, 200],
    })
    for (const [minor, index] of Object.values(CONTOUR_THRESHOLDS_FT)) expect(index).toBe(minor * 5)
  })

  // From zoom 8, a region-wide view: the source and its three layers start at
  // the table's first entry, so nothing asks for a tile the library answers
  // empty.
  it('starts the contours at the first zoom the table names', async () => {
    expect(CONTOUR_MINZOOM).toBe(Math.min(...Object.keys(CONTOUR_THRESHOLDS_FT).map(Number)))
    expect(CONTOUR_MINZOOM).toBe(8)
    const { stub, terrain } = setup()
    terrain.update({ ...OFF, contours: true })
    await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
    const spec = stub.calls.find((c) => c[0] === 'addSource')![2] as { minzoom: number }
    expect(spec.minzoom).toBe(CONTOUR_MINZOOM)
    for (const id of [CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER]) {
      expect(stub.specs[id].minzoom).toBe(CONTOUR_MINZOOM)
    }
  })

  // 3D stands the map on a source of its own, tilts a flat map so the press
  // does something, and lays it flat again facing where it faced.
  it('stands the map on its own elevation source and tilts it, and lays it flat when switched off', async () => {
    const { stub, terrain } = setup({ bearing: 30 })
    terrain.update({ ...OFF, terrain: true })
    await vi.waitFor(() => expect(stub.camera.pitch).toBe(TERRAIN_PITCH))
    expect(stub.map.getTerrain()).toEqual({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
    expect(sourcesAdded(stub.calls)).toEqual([TERRAIN_SOURCE])
    // No layer: the terrain is the map's, not a picture on it.
    expect(stub.calls.some((c) => c[0] === 'addLayer')).toBe(false)
    terrain.update(OFF)
    expect(stub.calls.filter((c) => c[0] === 'setTerrain').pop()).toEqual(['setTerrain', null])
    expect([stub.camera.pitch, stub.camera.bearing]).toEqual([0, 30])
  })

  // A reader who already tilted the map keeps the tilt.
  it('leaves a tilted map at its tilt', async () => {
    const { stub, terrain } = setup({ pitch: 20 })
    terrain.update({ ...OFF, terrain: true })
    await vi.waitFor(() => expect(stub.map.getTerrain()).not.toBeNull())
    expect(stub.calls.some((c) => c[0] === 'easeTo')).toBe(false)
  })

  // The relief is a picture of its own, draped over the 3D terrain like any
  // raster, so 3D adds the terrain's elevation source and nothing else.
  it('keeps the relief on a source apart from the terrain', async () => {
    const { stub, terrain } = setup()
    terrain.update({ relief: true, contours: false, terrain: true })
    await vi.waitFor(() => expect(stub.map.getTerrain()).not.toBeNull())
    expect(sourcesAdded(stub.calls)).toEqual([RELIEF_SOURCE, TERRAIN_SOURCE])
    expect(stub.calls.filter((c) => c[0] === 'setTerrain')).toEqual([['setTerrain', { source: TERRAIN_SOURCE, exaggeration: 1 }]])
  })

  // A switch thrown while the library loads is the one that counts.
  it('applies the latest switches once the library has loaded', async () => {
    const { stub, terrain, load } = setup()
    terrain.update({ ...OFF, terrain: true })
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.stack).toContain(RELIEF_LAYER))
    expect(load).toHaveBeenCalledOnce()
    expect(stub.calls.some((c) => c[0] === 'setTerrain')).toBe(false)
  })

  // A failed chunk draws nothing, says so on the console, and the next switch
  // asks again.
  it('tries the library again on the next switch after it failed to load', async () => {
    const stub = stubMap({ styleLayers: STYLE_LAYERS })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tiles: DemTiles = { sharedDemProtocolUrl: 'x://{z}/{x}/{y}', contourProtocolUrl: () => '', getDemTile: vi.fn() }
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValueOnce(tiles)
    const terrain = mountTerrain(stub.map, { load })
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce())
    expect(stub.stack).not.toContain(RELIEF_LAYER)
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.stack).toContain(RELIEF_LAYER))
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('loadDemTiles', () => {
  // The library reads Mapterhorn's tiles as Terrarium, to the zoom every
  // region holds, in a worker, and registers its two schemes with MapLibre.
  it('reads Mapterhorn as Terrarium to zoom 12 and registers its schemes with MapLibre', async () => {
    const tiles = await loadDemTiles()
    expect(constructed).toEqual([{ url: DEM_TILES, encoding: 'terrarium', maxzoom: 12, id: 'bluebird-dem', worker: true }])
    expect(setupMaplibre).toHaveBeenCalledWith({ addProtocol })
    expect(tiles.sharedDemProtocolUrl).toBe('bluebird-dem-shared://{z}/{x}/{y}')
  })

  // The slope shading's scheme goes in with the library's, never before it.
  it('registers the slope scheme once the library has loaded', async () => {
    addProtocol.mockClear()
    await loadDemTiles()
    expect(addProtocol).toHaveBeenCalledWith(SLOPE_SCHEME, expect.any(Function))
  })
})

describe('the slope angle shading', () => {
  it('adds nothing and loads nothing while it is off', async () => {
    const { stub, terrain, load } = setup()
    terrain.updateSlope(false)
    terrain.update(OFF)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(load).not.toHaveBeenCalled()
    expect(stub.calls).toEqual([])
  })

  // A raster of the app's own scheme, credited to Mapterhorn, 512px, capped
  // at the slope's own zoom, at half strength.
  it('adds its raster the first time it is on', async () => {
    const { stub, terrain, load } = setup()
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(SLOPE_LAYER))
    expect(load).toHaveBeenCalledOnce()
    expect(sourcesAdded(stub.calls)).toEqual([SLOPE_SOURCE])
    expect(stub.calls.find((c) => c[0] === 'addSource')![2]).toEqual({
      type: 'raster',
      tiles: [SLOPE_TILES],
      tileSize: 512,
      maxzoom: SLOPE_MAXZOOM,
      attribution: MAPTERHORN_ATTRIBUTION,
    })
    // Finer than the relief and 3D, whose raster-dem sources cannot fall back
    // on a missing tile and so stop at the zoom every land tile answers.
    expect(SLOPE_MAXZOOM).toBeGreaterThan(DEM_MAXZOOM)
    expect(stub.calls.find((c) => c[0] === 'addLayer')).toEqual(['addLayer', SLOPE_LAYER, 'ofm-trails'])
    expect(SLOPE_PAINT).toEqual({ 'raster-opacity': SLOPE_ALPHA })
    // At the row's default level, which is the same half.
    expect(stub.paint[SLOPE_LAYER]['raster-opacity']).toBe(SLOPE_ALPHA)
  })

  it('hides when switched off and shows again, adding nothing twice', async () => {
    const { stub, terrain, load } = setup()
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(SLOPE_LAYER))
    terrain.updateSlope(false)
    expect(visibility(stub, SLOPE_LAYER)).toBe('none')
    terrain.updateSlope(true)
    expect(visibility(stub, SLOPE_LAYER)).toBe('visible')
    expect(load).toHaveBeenCalledOnce()
    expect(stub.calls.filter((c) => c[0] === 'addLayer')).toHaveLength(1)
  })

  // While the relief is drawn the slope's tiles carry its light, so a flat
  // band never washes the shading out; without it they are flat, so the
  // Shaded relief row stays the one switch for shading. A level of 0 hides
  // the relief, so it counts as off.
  it("lights the slope's tiles while the relief is drawn and only then", async () => {
    const { stub, terrain } = setup()
    terrain.update({ ...OFF, relief: true })
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(SLOPE_LAYER))
    const slopeSpec = stub.calls.find((c) => c[0] === 'addSource' && c[1] === SLOPE_SOURCE)![2] as { tiles: string[] }
    expect(slopeSpec.tiles).toEqual([SLOPE_SHADED_TILES])
    terrain.update(OFF)
    expect(stub.calls.filter((c) => c[0] === 'setTiles')).toEqual([['setTiles', SLOPE_SOURCE, [SLOPE_TILES]]])
    terrain.update({ ...OFF, relief: true })
    terrain.opacity({ relief: 0, contours: 0.5, slope: 0.5 })
    terrain.opacity({ relief: 0.5, contours: 0.5, slope: 0.5 })
    expect(stub.calls.filter((c) => c[0] === 'setTiles').map((c) => (c[2] as string[])[0])).toEqual([
      SLOPE_TILES,
      SLOPE_SHADED_TILES,
      SLOPE_TILES,
      SLOPE_SHADED_TILES,
    ])
  })

  // Over the relief and under the contours, whichever of the three is on
  // first, and the other layers' switches leave it as it is.
  it('stacks over the relief and under the contours, in any order', async () => {
    const orders = [
      ['relief', 'slope', 'contours'],
      ['slope', 'relief', 'contours'],
      ['contours', 'slope', 'relief'],
      ['slope', 'contours', 'relief'],
    ] as const
    for (const order of orders) {
      const { stub, terrain } = setup()
      let want = OFF
      for (const key of order) {
        if (key === 'slope') terrain.updateSlope(true)
        else {
          want = { ...want, [key]: true }
          terrain.update(want)
        }
        const id = { relief: RELIEF_LAYER, slope: SLOPE_LAYER, contours: CONTOUR_LAYER }[key]
        await vi.waitFor(() => expect(stub.stack).toContain(id))
      }
      expect([order, stub.stack.slice(3, 10)]).toEqual([
        order,
        [RELIEF_LAYER, SLOPE_LAYER, CONTOUR_CASING_LAYER, CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER, 'ofm-trails'],
      ])
      terrain.update(OFF)
      expect(visibility(stub, SLOPE_LAYER)).not.toBe('none')
    }
  })
})

// The three elevation rows' opacity sliders (record 0250), each 0 to 1, the
// default a half, which is the look each had before it had a slider.
describe('the opacity levels', () => {
  // The relief's tiles paint the shadow and the light whole, so its level is
  // the layer's opacity, as the slope's is.
  it("sets the relief's opacity to its level", () => {
    for (const level of [0, 0.25, 0.5, 1]) expect(reliefPaint(level)).toEqual({ 'raster-opacity': level })
  })

  // A level set before the library loads is the one each layer is added at.
  it('adds each layer at the level it was handed before it existed', async () => {
    const { stub, terrain } = setup()
    terrain.opacity({ relief: 1, contours: 1, slope: 0.8 })
    terrain.update({ ...OFF, relief: true, contours: true })
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
    expect(stub.paint[RELIEF_LAYER]['raster-opacity']).toBe(1)
    expect(stub.paint[SLOPE_LAYER]['raster-opacity']).toBe(0.8)
    expect(stub.paint[CONTOUR_LAYER]['line-opacity']).toBe(0.7)
  })

  it('moves the relief, the slope and the contours with their levels', async () => {
    const { stub, terrain } = setup()
    terrain.update({ ...OFF, relief: true, contours: true })
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
    terrain.opacity({ relief: 1, contours: 1, slope: 0.3 })
    expect(stub.paint[RELIEF_LAYER]['raster-opacity']).toBe(1)
    expect(stub.paint[SLOPE_LAYER]['raster-opacity']).toBe(0.3)
    // Each line at twice its ink's own opacity, held to 1, and the heights
    // whole from the default up.
    expect(stub.paint[CONTOUR_LAYER]['line-opacity']).toBe(0.7)
    expect(stub.paint[CONTOUR_INDEX_LAYER]['line-opacity']).toBe(1)
    expect(stub.paint[CONTOUR_LABEL_LAYER]['text-opacity']).toBe(1)
    terrain.opacity({ relief: 1, contours: 0.25, slope: 0.3 })
    expect(stub.paint[CONTOUR_LAYER]['line-opacity']).toBeCloseTo(0.175)
    expect(stub.paint[CONTOUR_INDEX_LAYER]['line-opacity']).toBeCloseTo(0.3)
    expect(stub.paint[CONTOUR_LABEL_LAYER]['text-opacity']).toBe(0.5)
    // The edge over the imagery scales with its lines.
    terrain.overImagery(true)
    expect(stub.paint[CONTOUR_LAYER]['line-opacity']).toBeCloseTo(0.35)
    expect(stub.paint[CONTOUR_CASING_LAYER]['line-opacity']).toEqual(['case', ['>', ['get', 'level'], 0], 0.3, 0.25])
  })

  // At 0 a layer draws nothing, so it hides and asks for no tile; it comes
  // back at the level it is given.
  it('hides a layer at 0 and shows it again above it', async () => {
    const { stub, terrain } = setup()
    terrain.update({ ...OFF, relief: true, contours: true })
    terrain.updateSlope(true)
    await vi.waitFor(() => expect(stub.stack).toContain(CONTOUR_LAYER))
    terrain.overImagery(true)
    terrain.opacity({ relief: 0, contours: 0, slope: 0 })
    for (const id of [RELIEF_LAYER, SLOPE_LAYER, CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER, CONTOUR_CASING_LAYER]) {
      expect([id, visibility(stub, id)]).toEqual([id, 'none'])
    }
    terrain.opacity({ relief: 0.5, contours: 0.5, slope: 0.5 })
    for (const id of [RELIEF_LAYER, SLOPE_LAYER, CONTOUR_LAYER, CONTOUR_CASING_LAYER]) {
      expect([id, visibility(stub, id)]).toEqual([id, 'visible'])
    }
  })
})
