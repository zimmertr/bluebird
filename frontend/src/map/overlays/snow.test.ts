import { describe, expect, it } from 'vitest'
import { SNOW_OPACITY, mountSnow, snowBeneath } from './snow'
import { SNOW_HELD_URL, SNOW_LAYER_ID, SNOW_SOURCE_ID, SNOW_TILE_SIZE } from '../../utils/snowDepth'
import { SNOW_HELD_LAYER, snowTileZoom } from '../../utils/snowPoint'
import { storeHolding } from '../../testSupport/heldTiles'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { stubMap } from '../../testSupport/stubMap'

const SMOKE_FIRST = 'smoke-fill-Light'
const RADAR_OLDEST = 'radar-50'

describe('snowBeneath', () => {
  it('goes under the radar loop when the loop is up', () => {
    expect(snowBeneath((id) => [RADAR_OLDEST, SMOKE_FIRST].includes(id))).toBe(RADAR_OLDEST)
  })

  it('goes under the smoke fills otherwise, where the loop would go', () => {
    expect(snowBeneath((id) => id === SMOKE_FIRST)).toBe(SMOKE_FIRST)
  })

  it('goes on top when neither is there', () => {
    expect(snowBeneath(() => false)).toBeUndefined()
  })
})

describe('mountSnow', () => {
  it('adds nothing until it is switched on', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountSnow(stub.map, { popups: fakeMapPopups().popups })
    expect(stub.stack).toEqual([SMOKE_FIRST])
  })

  it('sits under the radar whichever is switched on first', () => {
    const stub = stubMap({ layers: ['forecast-grid-fill', RADAR_OLDEST, SMOKE_FIRST] })
    mountSnow(stub.map, { popups: fakeMapPopups().popups }).update({ show: true })
    expect(stub.stack).toEqual(['forecast-grid-fill', SNOW_LAYER_ID, RADAR_OLDEST, SMOKE_FIRST])
    expect(stub.paint[SNOW_LAYER_ID]['raster-opacity']).toBe(SNOW_OPACITY)
  })

  it('removes its layer and source when switched off, and adds them again', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const snow = mountSnow(stub.map, { popups: fakeMapPopups().popups })
    snow.update({ show: true })
    snow.update({ show: false })
    expect(stub.stack).toEqual([SMOKE_FIRST])
    expect(stub.sources[SNOW_SOURCE_ID]).toBeUndefined()
    snow.update({ show: true })
    expect(stub.stack).toEqual([SNOW_LAYER_ID, SMOKE_FIRST])
  })

  it('does nothing for a repeat of the same state', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const snow = mountSnow(stub.map, { popups: fakeMapPopups().popups })
    snow.update({ show: true })
    const before = stub.calls.length
    snow.update({ show: true })
    expect(stub.calls.length).toBe(before)
  })
})

describe('mountSnow click reading', () => {
  it('registers a point target that is asked only while the field is on', async () => {
    const AT = { lng: -121.76, lat: 46.85, zoom: 11 }
    // Deep snow's legend colour, #3c3fc2.
    const tiles = storeHolding({ size: SNOW_TILE_SIZE, layer: SNOW_HELD_LAYER, ...AT, z: snowTileZoom(11), rgba: [60, 63, 194, 255] })
    const { popups, points } = fakeMapPopups()
    const snow = mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, tiles })
    expect(points.map((p) => p.target)).toEqual(['snow'])
    expect(points[0].shown()).toBe(false)
    snow.update({ show: true })
    expect(points[0].shown()).toBe(true)
    expect(await points[0].paints(AT)).toBe(true)
  })

  it('loads through the held-tile scheme', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountSnow(stub.map, { popups: fakeMapPopups().popups }).update({ show: true })
    const added = stub.calls.find((c) => c[0] === 'addSource' && c[1] === SNOW_SOURCE_ID)
    expect((added?.[2] as { tiles: string[] }).tiles).toEqual([SNOW_HELD_URL])
  })

  it('takes its cards down when switched off', () => {
    const { popups, closed } = fakeMapPopups()
    const snow = mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    snow.update({ show: true })
    snow.update({ show: false })
    expect(closed).toEqual(['snow'])
  })
})
