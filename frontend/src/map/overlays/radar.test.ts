import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RADAR_OPACITY, RADAR_WARM_MS, activeOffset, mountRadar } from './radar'
import { radarHeldUrl, radarLayerId, radarOffsets } from '../../utils/radar'
import { RADAR_TILE_PX, radarHeldLayer, radarTileZoom } from '../../utils/radarPoint'
import { storeHolding } from '../../testSupport/heldTiles'
import { markupText } from '../../testSupport/markupText'
import { fakeMapPopups } from '../../testSupport/fakeMapPopups'
import { stubMap } from '../../testSupport/stubMap'

const SMOKE_FIRST = 'smoke-fill-Light'
const frames = radarOffsets().map(radarLayerId)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('activeOffset', () => {
  it('clamps a playhead to the ends of the loop', () => {
    const offsets = [50, 40, 30]
    expect(activeOffset(offsets, -3)).toBe(50)
    expect(activeOffset(offsets, 1)).toBe(40)
    expect(activeOffset(offsets, 99)).toBe(30)
  })
})

describe('mountRadar', () => {
  it('adds nothing until it is switched on', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountRadar(stub.map, { popups: fakeMapPopups().popups })
    expect(stub.stack).toEqual([SMOKE_FIRST])
  })

  // Under every polygon overlay: the loop goes in beneath the first smoke fill.
  it('puts every frame beneath the first smoke fill, oldest lowest', () => {
    const stub = stubMap({ layers: ['forecast-grid-fill', SMOKE_FIRST, 'wildfire-fill'] })
    mountRadar(stub.map, { popups: fakeMapPopups().popups }).update({ show: true, index: 0 })
    expect(stub.stack).toEqual(['forecast-grid-fill', ...frames, SMOKE_FIRST, 'wildfire-fill'])
  })

  it('shows only the frame under the playhead, at the loop opacity', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const radar = mountRadar(stub.map, { popups: fakeMapPopups().popups })
    radar.update({ show: true, index: 2 })
    const active = radarLayerId(radarOffsets()[2])
    expect(stub.layout[active].visibility).toBe('visible')
    expect(stub.paint[active]['raster-opacity']).toBe(RADAR_OPACITY)
    for (const id of frames.filter((f) => f !== active)) {
      expect(stub.paint[id]['raster-opacity']).toBe(0)
    }
    radar.update({ show: true, index: 3 })
    expect(stub.paint[active]['raster-opacity']).toBe(0)
  })

  // One frame per tick rather than a burst of every frame's tiles at once.
  it('arms the other frames one at a time, then stops', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountRadar(stub.map, { popups: fakeMapPopups().popups }).update({ show: true, index: 0 })
    const armed = () => frames.filter((id) => stub.layout[id].visibility === 'visible').length
    expect(armed()).toBe(1)
    vi.advanceTimersByTime(RADAR_WARM_MS)
    expect(armed()).toBe(1)
    vi.advanceTimersByTime(RADAR_WARM_MS)
    expect(armed()).toBe(2)
    vi.advanceTimersByTime(RADAR_WARM_MS * frames.length)
    expect(armed()).toBe(frames.length)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps warming while a source has not loaded its tiles', () => {
    let loaded = false
    const stub = stubMap({ layers: [SMOKE_FIRST], sourceLoaded: () => loaded })
    mountRadar(stub.map, { popups: fakeMapPopups().popups }).update({ show: true, index: 0 })
    vi.advanceTimersByTime(RADAR_WARM_MS * (frames.length + 3))
    expect(vi.getTimerCount()).toBe(1)
    loaded = true
    vi.advanceTimersByTime(RADAR_WARM_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes every frame and its warm-up when switched off', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const radar = mountRadar(stub.map, { popups: fakeMapPopups().popups })
    radar.update({ show: true, index: 0 })
    radar.update({ show: false, index: 0 })
    expect(stub.stack).toEqual([SMOKE_FIRST])
    expect(Object.keys(stub.sources)).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops the warm-up when disposed', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const radar = mountRadar(stub.map, { popups: fakeMapPopups().popups })
    radar.update({ show: true, index: 0 })
    radar.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('mountRadar click reading', () => {
  it('registers a point target that is asked only while the loop is on', () => {
    const { popups, points } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    expect(points.map((p) => p.target)).toEqual(['radar'])
    expect(points[0].shown()).toBe(false)
    radar.update({ show: true, index: 0 })
    expect(points[0].shown()).toBe(true)
    radar.update({ show: false, index: 0 })
    expect(points[0].shown()).toBe(false)
  })

  // During playback the reader is looking at an older picture than now, and
  // the pointer and a click read the picture they are looking at.
  it('reads the frame on screen from the tiles it holds', async () => {
    const AT = { lng: -121.5, lat: 47.5, zoom: 7 }
    const onScreen = radarOffsets()[2]
    const tiles = storeHolding({
      size: RADAR_TILE_PX,
      layer: radarHeldLayer(onScreen),
      ...AT,
      z: radarTileZoom(AT.zoom),
      rgba: [9, 111, 12, 255],
    })
    const { popups, points } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, tiles })
    radar.update({ show: true, index: 2 })
    expect(await points[0].paints(AT)).toBe(true)
    const reading = await points[0].read(AT, new AbortController().signal)
    expect(reading?.section.rows.map(markupText)).toContain(`Updated: ${onScreen} min ago`)
    radar.update({ show: true, index: 5 })
    expect(await points[0].paints(AT)).toBe(false)
  })

  // A new frame is a new picture under an open card and a resting mouse
  // (#748), and the same frame again is not.
  it('asks for its open cards to be read again when the frame on screen changes, and only then', () => {
    const { popups, refreshed } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    radar.update({ show: true, index: 2 })
    const asked = refreshed.length
    radar.update({ show: true, index: 2 })
    expect(refreshed).toHaveLength(asked)
    radar.update({ show: true, index: 5 })
    expect(refreshed).toHaveLength(asked + 1)
    expect(new Set(refreshed)).toEqual(new Set(['radar']))
  })

  // A frame the view moved away from while it waited at opacity 0 fetches
  // its tiles only when the playhead lands on it, after the card was read
  // again, so each of its tiles arriving reads the card once more (#752).
  it('asks for its open cards to be read again as the frame on screen gets its tiles', () => {
    const { popups, refreshed } = fakeMapPopups()
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    const radar = mountRadar(stub.map, { popups })
    radar.update({ show: true, index: 2 })
    const onScreen = radarLayerId(radarOffsets()[2])
    const asked = refreshed.length
    stub.fire('sourcedata', undefined, { sourceId: onScreen, tile: {} })
    expect(refreshed).toHaveLength(asked + 1)
    // Another frame's tile, or the source's own metadata, is no new picture.
    stub.fire('sourcedata', undefined, { sourceId: radarLayerId(radarOffsets()[3]), tile: {} })
    stub.fire('sourcedata', undefined, { sourceId: onScreen })
    expect(refreshed).toHaveLength(asked + 1)
    radar.update({ show: false, index: 2 })
    stub.fire('sourcedata', undefined, { sourceId: onScreen, tile: {} })
    expect(refreshed).toHaveLength(asked + 1)
  })

  it('reads an open card again from the frame now on screen', async () => {
    const AT = { lng: -121.5, lat: 47.5, zoom: 7 }
    const onScreen = radarOffsets()[2]
    const tiles = storeHolding({ size: RADAR_TILE_PX, layer: radarHeldLayer(onScreen), ...AT, z: radarTileZoom(7), rgba: [9, 111, 12, 255] })
    const { popups, points } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups, tiles })
    radar.update({ show: true, index: 2 })
    const signal = new AbortController().signal
    expect((await points[0].refresh!(AT, signal)).rows.map(markupText)).toContain(`Updated: ${onScreen} min ago`)
    radar.update({ show: true, index: 5 })
    expect((await points[0].refresh!(AT, signal)).title).toBe('No radar echo')
  })

  // The frames load through the scheme that keeps a copy of every tile.
  it('loads every frame through the held-tile scheme', () => {
    const stub = stubMap({ layers: [SMOKE_FIRST] })
    mountRadar(stub.map, { popups: fakeMapPopups().popups }).update({ show: true, index: 0 })
    for (const offset of radarOffsets()) {
      const added = stub.calls.find((c) => c[0] === 'addSource' && c[1] === radarLayerId(offset))
      expect((added?.[2] as { tiles: string[] }).tiles).toEqual([radarHeldUrl(offset)])
    }
  })

  it('takes its cards down when switched off', () => {
    const { popups, closed } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    radar.update({ show: true, index: 0 })
    expect(closed).toEqual([])
    radar.update({ show: false, index: 0 })
    expect(closed).toEqual(['radar'])
  })

  it('forgets the tiles it held when switched off', async () => {
    const AT = { lng: -121.5, lat: 47.5, zoom: 7 }
    const tiles = storeHolding({ size: RADAR_TILE_PX, layer: radarHeldLayer(0), ...AT, z: radarTileZoom(7), rgba: [9, 111, 12, 255] })
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups: fakeMapPopups().popups, tiles })
    radar.update({ show: true, index: 5 })
    radar.update({ show: false, index: 5 })
    expect(await tiles.pixel(radarHeldLayer(0), AT.lng, AT.lat, radarTileZoom(7))).toBeNull()
  })
})
