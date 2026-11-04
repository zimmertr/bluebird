import { describe, expect, it, vi } from 'vitest'
import { SNOW_OPACITY, mountSnow, snowBeneath } from './snow'
import { SNOW_HELD_URL, SNOW_LAYER_ID, SNOW_SOURCE_ID, SNOW_TILE_SIZE } from '../../utils/snowDepth'
import {
  SNOW_HELD_LAYER,
  failedSnowSection,
  pendingSnowSection,
  snowSection,
  snowTileZoom,
} from '../../utils/snowPoint'
import type { PointReading } from '../../utils/pointReadout'
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
    // The 20 to 39 in band's legend colour, #3c3fc2.
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

  // A section about snow the map no longer draws leaves its card; the card
  // stays for whatever else it says.
  it('asks the open cards to read it again when switched off', () => {
    const { popups, points, closed, refreshed } = fakeMapPopups()
    const snow = mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    snow.update({ show: true })
    expect(refreshed).toEqual([])
    snow.update({ show: false })
    expect(refreshed).toEqual(['snow'])
    expect(closed).toEqual([])
    expect(points[0].shown()).toBe(false)
  })

  it('forgets the tiles it held when switched off', async () => {
    const AT = { lng: -121.76, lat: 46.85, zoom: 11 }
    const tiles = storeHolding({ size: SNOW_TILE_SIZE, layer: SNOW_HELD_LAYER, ...AT, z: snowTileZoom(11), rgba: [60, 63, 194, 255] })
    const { popups, points } = fakeMapPopups()
    const snow = mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, tiles })
    snow.update({ show: true })
    snow.update({ show: false })
    expect(await points[0].paints(AT)).toBe(false)
  })
})

// A card open when the field came on read nothing there, and read the snow
// again only when the field went off, so its section never came (#832).
describe('mountSnow and the open cards', () => {
  const AT = { lng: -121.76, lat: 46.85, zoom: 11 }
  const signal = () => new AbortController().signal

  it('asks the open cards to read it again as each of its tiles arrives', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const { popups, refreshed } = fakeMapPopups()
    const snow = mountSnow(stub.map, { popups })
    stub.fire('sourcedata', undefined, { sourceId: SNOW_SOURCE_ID, tile: {} })
    expect(refreshed).toEqual([])
    snow.update({ show: true })
    stub.fire('sourcedata', undefined, { sourceId: SNOW_SOURCE_ID, tile: {} })
    expect(refreshed).toEqual(['snow'])
    // Another source's tile, or the source's own news with no tile in it.
    stub.fire('sourcedata', undefined, { sourceId: 'radar-0', tile: {} })
    stub.fire('sourcedata', undefined, { sourceId: SNOW_SOURCE_ID })
    expect(refreshed).toEqual(['snow'])
  })

  // Each arriving tile reads every open card again; NOAA is asked once a
  // point, and a card keeps the numbers it shows rather than a row of bars.
  it('answers a point it has read with that reading, settled, and asks NOAA once', async () => {
    const final = snowSection('Deep snow', { depthIn: 40, sweIn: 12, validMs: Date.UTC(2026, 10, 3, 13) })
    const readAt = vi.fn(() => ({ section: pendingSnowSection('Deep snow', false), later: Promise.resolve(final) }))
    const { popups, points } = fakeMapPopups()
    const snow = mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, readAt })
    snow.update({ show: true })
    const first = points[0].read(AT, signal()) as PointReading
    await first.later
    expect(points[0].refresh!(AT, signal())).toEqual({ section: final })
    expect(points[0].read(AT, signal())).toEqual({ section: final })
    expect(readAt).toHaveBeenCalledTimes(1)
    // Switched off and on, the field is a new picture, asked again.
    snow.update({ show: false })
    snow.update({ show: true })
    points[0].read(AT, signal())
    expect(readAt).toHaveBeenCalledTimes(2)
  })

  // The reader's next click is the next attempt; a tile arriving is not one.
  it('asks NOAA again for a failed point on a new card, and not as tiles arrive', async () => {
    const failed = failedSnowSection('Deep snow')
    const readAt = vi.fn(() => ({ section: pendingSnowSection('Deep snow', false), later: Promise.resolve(failed) }))
    const { popups, points } = fakeMapPopups()
    mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, readAt }).update({ show: true })
    await (points[0].read(AT, signal()) as PointReading).later
    expect(points[0].refresh!(AT, signal())).toEqual({ section: failed })
    expect(readAt).toHaveBeenCalledTimes(1)
    points[0].read(AT, signal())
    expect(readAt).toHaveBeenCalledTimes(2)
  })

  it('keeps nothing where the field painted nothing', () => {
    const readAt = vi.fn(() => null)
    const { popups, points } = fakeMapPopups()
    mountSnow(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, readAt }).update({ show: true })
    expect(points[0].read(AT, signal())).toBeNull()
    expect(points[0].refresh!(AT, signal())).toBeNull()
    expect(readAt).toHaveBeenCalledTimes(2)
  })
})
