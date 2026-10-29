import { describe, expect, it } from 'vitest'
import { IMAGERY_EOX, IMAGERY_USGS, basemapGround, fadedOpacity, groundAbove, imageryBeneath, mountImagery } from './imagery'
import { EOX_IMAGERY_TILES, USGS_IMAGERY_TILES } from '../../utils/terrainSources'
import { stubMap } from '../../testSupport/stubMap'
import { TRAIL_CASING_LAYER } from '../basemap'
// Liberty's layer list as OpenFreeMap served it on 2026-10-27
// (`https://tiles.openfreemap.org/styles/liberty`), cut to each layer's id,
// type, source and source layer, so the fade is pinned to the real names.
import liberty from './fixtures/liberty-layers.json'

// Three of Liberty's own opacities, as its style sets them, so a fade can be
// seen scaling a value and a switch-off putting it back.
const STYLE_OPACITY: Record<string, Record<string, number>> = {
  park: { 'fill-opacity': 0.7 },
  landcover_wood: { 'fill-opacity': 0.4 },
  'building-3d': { 'fill-extrusion-opacity': 0.8 },
}
const styleLayers = liberty.map((l) => ({ ...l, ...(STYLE_OPACITY[l.id] ? { paint: STYLE_OPACITY[l.id] } : {}) }))

// Every layer the imagery covers or fades: Liberty's ground.
const GROUND = [
  'background',
  'natural_earth',
  'park',
  'landuse_residential',
  'landcover_wood',
  'landcover_grass',
  'landcover_ice',
  'landcover_wetland',
  'landuse_pitch',
  'landuse_track',
  'landuse_cemetery',
  'landuse_hospital',
  'landuse_school',
  'waterway_tunnel',
  'waterway_river',
  'waterway_other',
  'water',
  'landcover_sand',
  'aeroway_fill',
  'building',
  'building-3d',
]
// The two Liberty draws over its roads, which the imagery fades instead of
// covering.
const ABOVE = ['building', 'building-3d']

function mounted() {
  const stub = stubMap({ styleLayers })
  const imagery = mountImagery(stub.map, { online: null })
  return { stub, imagery }
}

// Every call that touched a layer, by the layer's id.
const touched = (stub: ReturnType<typeof stubMap>, id: string) =>
  stub.calls.filter((c) => (c[0] === 'setPaintProperty' || c[0] === 'setLayoutProperty') && c[1] === id)

describe('basemapGround', () => {
  it('names the ground a photo shows for itself and keeps every road, line and label out of it', () => {
    expect(liberty.filter((l) => basemapGround(l) !== null).map((l) => l.id)).toEqual(GROUND)
    const kept = liberty.filter((l) => basemapGround(l) === null)
    // Nothing a photo cannot say: no symbol, no road, no boundary.
    expect(kept.some((l) => l.type === 'symbol')).toBe(true)
    expect(kept.map((l) => l.id)).toEqual(expect.arrayContaining(['road_area_pattern', 'park_outline', 'boundary_2', 'road_path_pedestrian', 'label_city', 'water_name_point_label']))
    for (const layer of kept) expect(['line', 'symbol', 'fill']).toContain(layer.type)
  })

  it('touches no layer on a source that is not the basemap\'s', () => {
    expect(basemapGround({ id: 'smoke-fill-Light', type: 'fill', source: 'smoke' })).toBeNull()
    expect(basemapGround({ id: 'forecast-grid-fill', type: 'raster', source: 'forecast-grid' })).toBeNull()
    expect(basemapGround({ id: 'draw-fill', type: 'fill', source: 'draw' })).toBeNull()
  })
})

describe('imageryBeneath', () => {
  // Over the last ground layer under the first road: the park outline and the
  // river lines among the fills go under the photos, the runways stay over.
  it('names the layer over Liberty\'s last ground fill under its first road', () => {
    expect(imageryBeneath(liberty)).toBe('aeroway_runway')
    const at = liberty.findIndex((l) => l.id === 'aeroway_runway')
    expect(liberty.slice(at).findIndex((l) => l.type === 'symbol' || l['source-layer'] === 'transportation')).toBeGreaterThan(0)
  })

  it('stays under the first layer that is not the basemap\'s, and names the top past the ground alone', () => {
    expect(imageryBeneath([{ id: 'background', type: 'background' }, { id: 'ofm-trails', type: 'line', source: 'trails' }])).toBe('ofm-trails')
    expect(imageryBeneath([{ id: 'background', type: 'background' }, { id: 'road_label', type: 'symbol' }])).toBe('road_label')
    expect(imageryBeneath([{ id: 'background', type: 'background' }])).toBeUndefined()
    expect(imageryBeneath([])).toBeUndefined()
  })

  it('leaves the buildings over it, since Liberty draws them over its roads', () => {
    expect(groundAbove(liberty).map((l) => l.id)).toEqual(ABOVE)
  })
})

describe('fadedOpacity', () => {
  it('takes the ground over the photos away with their level, and gives it back whole at 0', () => {
    expect(fadedOpacity(0.8, 0.5)).toBeCloseTo(0.4)
    expect(fadedOpacity(undefined, 0.25)).toBeCloseTo(0.75)
    expect(fadedOpacity(0.8, 1)).toBe(0)
    expect(fadedOpacity(0.8, 0)).toBe(0.8)
    expect(fadedOpacity(undefined, 0)).toBeUndefined()
    // An expression cannot be scaled, so it goes while the photos draw at all.
    expect(fadedOpacity(['get', 'o'], 0.3)).toBe(0)
  })
})

describe('mountImagery', () => {
  it('adds nothing until it is switched on', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: false, opacity: 0.5 })
    expect(stub.calls).toEqual([])
    expect(stub.stack).toEqual(liberty.map((l) => l.id))
  })

  it('adds both sources at the level, USGS over EOX, over the ground and under the first road', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true, opacity: 0.5 })
    const at = stub.stack.indexOf(IMAGERY_EOX)
    expect(stub.stack.slice(at - 1, at + 3)).toEqual(['aeroway_fill', IMAGERY_EOX, IMAGERY_USGS, 'aeroway_runway'])
    expect(stub.paint[IMAGERY_EOX]['raster-opacity']).toBe(0.5)
    expect(stub.paint[IMAGERY_USGS]['raster-opacity']).toBe(0.5)
    const spec = (id: string) => stub.calls.find((c) => c[0] === 'addSource' && c[1] === id)?.[2]
    expect(spec(IMAGERY_EOX)).toMatchObject({ type: 'raster', tiles: [EOX_IMAGERY_TILES], tileSize: 256, maxzoom: 14 })
    expect(spec(IMAGERY_USGS)).toMatchObject({ type: 'raster', tiles: [USGS_IMAGERY_TILES], tileSize: 256, minzoom: 13, maxzoom: 16 })
    // Nothing is asked of USGS over Europe, where every tile is a 404.
    expect(spec(IMAGERY_USGS)).toHaveProperty('bounds', [-180, -15, -64, 72])
    // Each carries its provider's short name, linked, for the map corner,
    // which keeps it to one line at a desk; the full lines are in NOTICES.md.
    expect(spec(IMAGERY_EOX)).toHaveProperty(
      'attribution',
      '<a href="https://cloudless.eox.at" target="_blank" rel="noopener noreferrer">EOX Sentinel-2 cloudless</a>',
    )
    expect(spec(IMAGERY_USGS)).toHaveProperty(
      'attribution',
      '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noopener noreferrer">USGS</a>',
    )
  })

  // The ground under the photos is what shows through as the level falls, so
  // nothing touches it, and the water fill a clicked lake is read from stays
  // as it was: `queryRenderedFeatures` answers for a fill under a raster, and
  // the browser suite reads one back over the imagery at 100%.
  it('leaves the ground under the photos as it is, the water fill included', () => {
    const { stub, imagery } = mounted()
    for (const opacity of [0.5, 1, 0.2, 0]) imagery.update({ show: true, opacity })
    imagery.update({ show: false, opacity: 0 })
    for (const id of GROUND.filter((g) => !ABOVE.includes(g))) expect(touched(stub, id)).toEqual([])
  })

  it('fades the buildings over the roads with the level and puts them back at 0 and off', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true, opacity: 0.5 })
    expect(stub.paint.building['fill-opacity']).toBeCloseTo(0.5)
    expect(stub.paint['building-3d']['fill-extrusion-opacity']).toBeCloseTo(0.4)
    imagery.update({ show: true, opacity: 1 })
    expect(stub.paint.building['fill-opacity']).toBe(0)
    expect(stub.paint['building-3d']['fill-extrusion-opacity']).toBe(0)
    imagery.update({ show: true, opacity: 0 })
    expect(stub.paint.building['fill-opacity']).toBeUndefined()
    expect(stub.paint['building-3d']['fill-extrusion-opacity']).toBe(0.8)
    imagery.update({ show: true, opacity: 0.25 })
    imagery.update({ show: false, opacity: 0.25 })
    expect(stub.paint.building['fill-opacity']).toBeUndefined()
    expect(stub.paint['building-3d']['fill-extrusion-opacity']).toBe(0.8)
  })

  // Both rasters at the one level: where USGS answers it covers EOX.
  it('moves both rasters with the level, and hides them at 0 so they ask for nothing', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true, opacity: 0.5 })
    imagery.update({ show: true, opacity: 0.8 })
    expect(stub.paint[IMAGERY_EOX]['raster-opacity']).toBe(0.8)
    expect(stub.paint[IMAGERY_USGS]['raster-opacity']).toBe(0.8)
    imagery.update({ show: true, opacity: 0 })
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('none')
    expect(stub.layout[IMAGERY_USGS].visibility).toBe('none')
    imagery.update({ show: true, opacity: 0.3 })
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('visible')
    expect(stub.paint[IMAGERY_USGS]['raster-opacity']).toBe(0.3)
  })

  it('hides the imagery when switched off and keeps its layers for the next time', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true, opacity: 0.5 })
    imagery.update({ show: false, opacity: 0.5 })
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('none')
    expect(stub.layout[IMAGERY_USGS].visibility).toBe('none')
    expect(stub.stack).toContain(IMAGERY_EOX)
  })

  it('adds nothing new on a second switch-on, and shows what it hid at the level held', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true, opacity: 0.5 })
    imagery.update({ show: false, opacity: 0.5 })
    const added = stub.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length
    imagery.update({ show: true, opacity: 0.7 })
    expect(stub.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length).toBe(added)
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('visible')
    expect(stub.layout[IMAGERY_USGS].visibility).toBe('visible')
    expect(stub.paint[IMAGERY_EOX]['raster-opacity']).toBe(0.7)
  })

  it('does nothing for a repeat of the same state', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: false, opacity: 0.5 })
    expect(stub.calls).toEqual([])
    imagery.update({ show: true, opacity: 0.5 })
    const before = stub.calls.length
    imagery.update({ show: true, opacity: 0.5 })
    expect(stub.calls.length).toBe(before)
  })

  // The basemap patch adds the casing hidden; the photos alone show it, in the
  // same update that shows them, and hide it with them.
  it('shows the trails\' casing while the photos draw, and hides it when they do not', () => {
    const stub = stubMap({ styleLayers, layers: [TRAIL_CASING_LAYER] })
    const imagery = mountImagery(stub.map, { online: null })
    imagery.update({ show: true, opacity: 0.5 })
    expect(stub.layout[TRAIL_CASING_LAYER].visibility).toBe('visible')
    imagery.update({ show: false, opacity: 0.5 })
    expect(stub.layout[TRAIL_CASING_LAYER].visibility).toBe('none')
    imagery.update({ show: true, opacity: 0.5 })
    expect(stub.layout[TRAIL_CASING_LAYER].visibility).toBe('visible')
    imagery.update({ show: true, opacity: 0 })
    expect(stub.layout[TRAIL_CASING_LAYER].visibility).toBe('none')
  })

  it('asks a failed host again when the browser is back online, and not before', () => {
    const online = new EventTarget()
    const stub = stubMap({ styleLayers })
    const imagery = mountImagery(stub.map, { online })
    imagery.update({ show: true, opacity: 0.5 })
    const refreshed = () => stub.calls.filter((c) => c[0] === 'refreshTiles').map((c) => c[1])
    // An error on some other source is not the imagery's.
    stub.fire('error', undefined, { sourceId: 'smoke' })
    online.dispatchEvent(new Event('online'))
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(refreshed()).toEqual([])
        stub.fire('error', undefined, { sourceId: IMAGERY_USGS })
        online.dispatchEvent(new Event('online'))
        setTimeout(() => {
          expect(refreshed()).toEqual([IMAGERY_EOX, IMAGERY_USGS])
          // One attempt per `online`: a second one with nothing failed asks nothing.
          online.dispatchEvent(new Event('online'))
          setTimeout(() => {
            expect(refreshed()).toHaveLength(2)
            resolve()
          }, 0)
        }, 0)
      }, 0)
    })
  })

  it('drops a failure once switched off', () => {
    const online = new EventTarget()
    const stub = stubMap({ styleLayers })
    const imagery = mountImagery(stub.map, { online })
    imagery.update({ show: true, opacity: 0.5 })
    stub.fire('error', undefined, { sourceId: IMAGERY_EOX })
    imagery.update({ show: false, opacity: 0.5 })
    online.dispatchEvent(new Event('online'))
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(stub.calls.some((c) => c[0] === 'refreshTiles')).toBe(false)
        resolve()
      }, 0)
    })
  })
})
