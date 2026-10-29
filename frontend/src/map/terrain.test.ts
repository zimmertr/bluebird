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
  CONTOUR_INDEX_LAYER,
  CONTOUR_LABEL_LAYER,
  CONTOUR_LAYER,
  CONTOUR_MINZOOM,
  CONTOUR_SOURCE,
  CONTOUR_THRESHOLDS_FT,
  DEM_MAXZOOM,
  DEM_SOURCE,
  MAPTERHORN_ATTRIBUTION,
  RELIEF_LAYER,
  TERRAIN_EXAGGERATION,
  TERRAIN_PITCH,
  TERRAIN_SOURCE,
  loadDemTiles,
  mountTerrain,
  type DemTiles,
} from './terrain'
import { DEM_TILES } from '../utils/terrainSources'
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
  const tiles: DemTiles = { sharedDemProtocolUrl: 'bluebird-dem-shared://{z}/{x}/{y}', contourProtocolUrl: contourUrl }
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

  // The relief goes in the first time it is asked for, as Terrarium: read as
  // MapLibre's default `mapbox` encoding the heights come out wrong silently.
  it('adds the elevation as Terrarium at 512px, credited, the first time the relief is on', async () => {
    const { stub, terrain, load } = setup()
    terrain.update({ ...OFF, relief: true })
    await vi.waitFor(() => expect(stub.sources[DEM_SOURCE]).toBeDefined())
    expect(load).toHaveBeenCalledOnce()
    expect(sourcesAdded(stub.calls)).toEqual([DEM_SOURCE])
    expect(stub.calls.find((c) => c[0] === 'addSource')![2]).toEqual({
      type: 'raster-dem',
      tiles: ['bluebird-dem-shared://{z}/{x}/{y}'],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: DEM_MAXZOOM,
      attribution: MAPTERHORN_ATTRIBUTION,
    })
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
      expect(stub.stack.slice(3, 8)).toEqual([RELIEF_LAYER, CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER, 'ofm-trails'])
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

  // The relief and the 3D terrain read the same tiles on two sources, so the
  // relief keeps its own zoom while 3D is on.
  it('keeps the relief on a source apart from the terrain', async () => {
    const { stub, terrain } = setup()
    terrain.update({ relief: true, contours: false, terrain: true })
    await vi.waitFor(() => expect(stub.map.getTerrain()).not.toBeNull())
    expect(sourcesAdded(stub.calls)).toEqual([DEM_SOURCE, TERRAIN_SOURCE])
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
    const tiles: DemTiles = { sharedDemProtocolUrl: 'x://{z}/{x}/{y}', contourProtocolUrl: () => '' }
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
})
