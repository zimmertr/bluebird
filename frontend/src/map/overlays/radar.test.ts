import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The reading itself is `radarPoint.ts`'s, tested there; this file holds what
// the overlay hands it.
const { readRadarAt } = vi.hoisted(() => ({ readRadarAt: vi.fn() }))
vi.mock('../../utils/radarPoint', () => ({ readRadarAt }))
import { RADAR_OPACITY, RADAR_WARM_MS, activeOffset, mountRadar } from './radar'
import { radarLayerId, radarOffsets } from '../../utils/radar'
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
  // a click describes the picture they are looking at.
  it('reads the frame on screen', () => {
    const { popups, points } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    radar.update({ show: true, index: 2 })
    const signal = new AbortController().signal
    void points[0].read({ lng: -121.5, lat: 47.5, zoom: 7 }, signal)
    expect(readRadarAt).toHaveBeenLastCalledWith(-121.5, 47.5, 7, radarOffsets()[2], signal)
  })

  it('takes its cards down when switched off', () => {
    const { popups, closed } = fakeMapPopups()
    const radar = mountRadar(stubMap({ layers: [SMOKE_FIRST] }).map, { popups })
    radar.update({ show: true, index: 0 })
    expect(closed).toEqual([])
    radar.update({ show: false, index: 0 })
    expect(closed).toEqual(['radar'])
  })
})
