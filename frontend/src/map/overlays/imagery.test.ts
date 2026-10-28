import { describe, expect, it } from 'vitest'
import { IMAGERY_EOX, IMAGERY_USGS, basemapFade, imageryBeneath, mountImagery } from './imagery'
import { EOX_IMAGERY_TILES, USGS_IMAGERY_TILES } from '../../utils/terrainSources'
import { stubMap } from '../../testSupport/stubMap'
// Liberty's layer list as OpenFreeMap served it on 2026-10-27
// (`https://tiles.openfreemap.org/styles/liberty`), cut to each layer's id,
// type, source and source layer, so the fade is pinned to the real names.
import liberty from './fixtures/liberty-layers.json'

// Three of Liberty's own opacities, as its style sets them, so a switch-off
// can be seen putting back a value rather than a default.
const STYLE_OPACITY: Record<string, Record<string, number>> = {
  park: { 'fill-opacity': 0.7 },
  landcover_wood: { 'fill-opacity': 0.4 },
  'building-3d': { 'fill-extrusion-opacity': 0.8 },
}
const styleLayers = liberty.map((l) => ({ ...l, ...(STYLE_OPACITY[l.id] ? { paint: STYLE_OPACITY[l.id] } : {}) }))

const FADED = [
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

function mounted() {
  const stub = stubMap({ styleLayers })
  const imagery = mountImagery(stub.map, { online: null })
  return { stub, imagery }
}

describe('basemapFade', () => {
  it('fades the ground the imagery replaces and keeps every road, line and label', () => {
    expect(liberty.filter((l) => basemapFade(l) !== null).map((l) => l.id)).toEqual(FADED)
    const kept = liberty.filter((l) => basemapFade(l) === null)
    // Nothing a photo cannot say goes: no symbol, no road, no boundary.
    expect(kept.some((l) => l.type === 'symbol')).toBe(true)
    expect(kept.map((l) => l.id)).toEqual(expect.arrayContaining(['road_area_pattern', 'park_outline', 'boundary_2', 'road_path_pedestrian', 'label_city', 'water_name_point_label']))
    for (const layer of kept) expect(['line', 'symbol', 'fill']).toContain(layer.type)
  })

  it('touches no layer on a source that is not the basemap\'s', () => {
    expect(basemapFade({ id: 'smoke-fill-Light', type: 'fill', source: 'smoke' })).toBeNull()
    expect(basemapFade({ id: 'forecast-grid-fill', type: 'raster', source: 'forecast-grid' })).toBeNull()
    expect(basemapFade({ id: 'draw-fill', type: 'fill', source: 'draw' })).toBeNull()
  })
})

describe('imageryBeneath', () => {
  it('names the layer directly above the background', () => {
    expect(imageryBeneath(liberty)).toBe('natural_earth')
  })

  it('names the first layer without a background, and the top without layers', () => {
    expect(imageryBeneath([{ id: 'water', type: 'fill' }])).toBe('water')
    expect(imageryBeneath([])).toBeUndefined()
  })
})

describe('mountImagery', () => {
  it('adds nothing until it is switched on', () => {
    const { stub } = mounted()
    expect(stub.calls).toEqual([])
    expect(stub.stack).toEqual(liberty.map((l) => l.id))
  })

  it('adds both sources and puts USGS over EOX, directly above the background', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true })
    expect(stub.stack.slice(0, 4)).toEqual(['background', IMAGERY_EOX, IMAGERY_USGS, 'natural_earth'])
    const spec = (id: string) => stub.calls.find((c) => c[0] === 'addSource' && c[1] === id)?.[2]
    expect(spec(IMAGERY_EOX)).toMatchObject({ type: 'raster', tiles: [EOX_IMAGERY_TILES], tileSize: 256, maxzoom: 14 })
    expect(spec(IMAGERY_USGS)).toMatchObject({ type: 'raster', tiles: [USGS_IMAGERY_TILES], tileSize: 256, minzoom: 13, maxzoom: 16 })
    // Each carries its provider's credit, for the map corner.
    expect(spec(IMAGERY_EOX)).toHaveProperty('attribution', expect.stringContaining('EOX IT Services GmbH'))
    expect(spec(IMAGERY_USGS)).toHaveProperty('attribution', expect.stringContaining('U.S. Geological Survey'))
  })

  it('fades the basemap\'s ground by opacity and never hides a layer', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true })
    for (const id of FADED) expect(stub.paint[id]?.[basemapFade(liberty.find((l) => l.id === id)!)!]).toBe(0)
    // The water fill a clicked lake is read from stays queryable.
    const hidden = stub.calls.filter((c) => c[0] === 'setLayoutProperty' && c[2] === 'visibility' && c[3] === 'none')
    expect(hidden).toEqual([])
    expect(stub.layout.water?.visibility).toBeUndefined()
  })

  it('puts every opacity back and hides the imagery when switched off', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true })
    imagery.update({ show: false })
    expect(stub.paint.park['fill-opacity']).toBe(0.7)
    expect(stub.paint.landcover_wood['fill-opacity']).toBe(0.4)
    expect(stub.paint['building-3d']['fill-extrusion-opacity']).toBe(0.8)
    // A layer the style left at its default goes back to the default.
    expect(stub.paint.water['fill-opacity']).toBeUndefined()
    expect(stub.paint.background['background-opacity']).toBeUndefined()
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('none')
    expect(stub.layout[IMAGERY_USGS].visibility).toBe('none')
    expect(stub.stack).toContain(IMAGERY_EOX)
  })

  it('adds nothing new on a second switch-on, and shows what it hid', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: true })
    imagery.update({ show: false })
    const added = stub.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length
    imagery.update({ show: true })
    expect(stub.calls.filter((c) => c[0] === 'addSource' || c[0] === 'addLayer').length).toBe(added)
    expect(stub.layout[IMAGERY_EOX].visibility).toBe('visible')
    expect(stub.layout[IMAGERY_USGS].visibility).toBe('visible')
    expect(stub.paint.park['fill-opacity']).toBe(0)
  })

  it('does nothing for a repeat of the same state', () => {
    const { stub, imagery } = mounted()
    imagery.update({ show: false })
    expect(stub.calls).toEqual([])
    imagery.update({ show: true })
    const before = stub.calls.length
    imagery.update({ show: true })
    expect(stub.calls.length).toBe(before)
  })

  it('asks a failed host again when the browser is back online, and not before', () => {
    const online = new EventTarget()
    const stub = stubMap({ styleLayers })
    const imagery = mountImagery(stub.map, { online })
    imagery.update({ show: true })
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
    imagery.update({ show: true })
    stub.fire('error', undefined, { sourceId: IMAGERY_EOX })
    imagery.update({ show: false })
    online.dispatchEvent(new Event('online'))
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(stub.calls.some((c) => c[0] === 'refreshTiles')).toBe(false)
        resolve()
      }, 0)
    })
  })
})
