import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchFireActivity } = vi.hoisted(() => ({ fetchFireActivity: vi.fn() }))
vi.mock('../../utils/fireActivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/fireActivity')>()),
  fetchFireActivity: (...args: unknown[]) => fetchFireActivity(...args),
}))

import type { FeatureCollection } from 'geojson'
import { FIRE_ACTIVITY_LAYER, FIRE_ACTIVITY_SOURCE, FIRE_STAR_IMAGE, fireActivityBox, mountFireActivity } from './fireActivity'
import { FIRE_REFETCH_DEBOUNCE_MS } from './wildfires'
import {
  FIRE_ACTIVITY_COLOR,
  FIRE_ACTIVITY_HALO_WIDTH,
  FIRE_ACTIVITY_ICON_SIZE,
  FIRE_ACTIVITY_MINZOOM,
  FIRE_ACTIVITY_RECOLOR_MS,
  FIRE_ACTIVITY_SORT_KEY,
  FIRE_ACTIVITY_STROKE,
} from '../../utils/fireActivity'
import { stubMap } from '../../testSupport/stubMap'

const HOUR = 60 * 60 * 1000
// The clock every test reads the bands against. 12 hours less 30 seconds
// after the first detection, so the first minute tick moves it a band.
const START = Date.parse('2026-10-27T20:00:00Z')
const DETECTIONS = {
  type: 'FeatureCollection',
  fetched_at: START,
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.5, 47.5] },
      properties: {
        acquired: new Date(START - 12 * HOUR + 30_000).toISOString(),
        instrument: 'VIIRS',
        satellite: 'N21',
        confidence: 'high',
        frp: 12.5,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-121.4, 47.6] },
      properties: {
        acquired: new Date(START - 30 * HOUR).toISOString(),
        instrument: 'MODIS',
        satellite: 'A',
        confidence: '66',
        frp: null,
      },
    },
  ],
}

let clock = START

function setup(zoom = 8) {
  const stub = stubMap({ zoom })
  const layer = mountFireActivity(stub.map, { online: null, now: () => clock })
  return { stub, layer }
}

const bands = (stub: ReturnType<typeof stubMap>) =>
  (stub.sources[FIRE_ACTIVITY_SOURCE].data as FeatureCollection).features.map((f) => f.properties?.band)

beforeEach(() => {
  vi.useFakeTimers()
  clock = START
  fetchFireActivity.mockReset()
  fetchFireActivity.mockResolvedValue(DETECTIONS)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('mountFireActivity', () => {
  // A starburst per detection (#799), as CalTopo draws them: one SDF image,
  // tinted per band and edged with a dark halo, every star drawn however they
  // crowd, and none taking a label's room.
  it('adds one starburst layer from the module values, and fetches nothing while off', () => {
    const { stub } = setup()
    expect(stub.stack).toEqual([FIRE_ACTIVITY_LAYER])
    const addImage = stub.calls.filter((c) => c[0] === 'addImage')
    expect(addImage).toEqual([['addImage', FIRE_STAR_IMAGE]])
    expect(stub.specs[FIRE_ACTIVITY_LAYER].type).toBe('symbol')
    expect(stub.specs[FIRE_ACTIVITY_LAYER].minzoom).toBe(FIRE_ACTIVITY_MINZOOM)
    expect(stub.layout[FIRE_ACTIVITY_LAYER]).toEqual({
      'icon-image': FIRE_STAR_IMAGE,
      'icon-size': FIRE_ACTIVITY_ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': FIRE_ACTIVITY_SORT_KEY,
    })
    expect(stub.paint[FIRE_ACTIVITY_LAYER]).toEqual({
      'icon-color': FIRE_ACTIVITY_COLOR,
      'icon-halo-color': FIRE_ACTIVITY_STROKE,
      'icon-halo-width': FIRE_ACTIVITY_HALO_WIDTH,
    })
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS * 3)
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchFireActivity).not.toHaveBeenCalled()
  })

  it('fetches the view when switched on and again after a pan settles', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
    expect(fetchFireActivity.mock.calls[0][0]).toEqual([-122, 47, -121, 48])
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    stub.fire('moveend')
    stub.fire('moveend')
    vi.advanceTimersByTime(FIRE_REFETCH_DEBOUNCE_MS)
    expect(fetchFireActivity).toHaveBeenCalledTimes(2)
  })

  it('reads the box the way the wildfire overlay does', () => {
    expect(fireActivityBox(stubMap({ bounds: { west: -125, south: 31, east: -102, north: 49 } }).map)).toEqual([
      -125, 31, -102, 49,
    ])
  })

  it('fetches nothing below its floor, where it draws nothing', async () => {
    const { layer } = setup(FIRE_ACTIVITY_MINZOOM - 0.5)
    layer.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchFireActivity).not.toHaveBeenCalled()
  })

  // The band is the clock's, not the data's: a detection turns orange at 12
  // hours with no fetch, and a minute that moves no band repaints nothing.
  it('moves a detection into its next band as the minutes pass, without a fetch', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    const painted = () => stub.calls.filter((c) => c[0] === 'setData').length
    const before = painted()
    clock += FIRE_ACTIVITY_RECOLOR_MS
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(bands(stub)).toEqual([1, 2])
    expect(painted()).toBe(before + 1)
    clock += FIRE_ACTIVITY_RECOLOR_MS
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(painted()).toBe(before + 1)
    // Past 48 hours the old one is no longer drawn.
    clock += 18 * HOUR
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS)
    expect(bands(stub)).toEqual([2])
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
  })

  it('clears the timer, the listener and the points when switched off', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    expect(vi.getTimerCount()).toBe(1)
    layer.update({ show: false })
    expect(vi.getTimerCount()).toBe(0)
    expect(stub.handlerCount('moveend')).toBe(0)
    expect((stub.sources[FIRE_ACTIVITY_SOURCE].data as FeatureCollection).features).toEqual([])
    const painted = stub.calls.filter((c) => c[0] === 'setData').length
    clock += 13 * HOUR
    vi.advanceTimersByTime(FIRE_ACTIVITY_RECOLOR_MS * 2)
    expect(stub.calls.filter((c) => c[0] === 'setData').length).toBe(painted)
  })

  // A view with no fires empties the layer rather than leaving the last
  // view's points standing.
  it('empties the layer for a view with nothing in it', async () => {
    const { stub, layer } = setup()
    layer.update({ show: true })
    await vi.waitFor(() => expect(bands(stub)).toEqual([0, 2]))
    fetchFireActivity.mockResolvedValue({ type: 'FeatureCollection', features: [] })
    stub.fire('moveend')
    await vi.advanceTimersByTimeAsync(FIRE_REFETCH_DEBOUNCE_MS)
    expect(bands(stub)).toEqual([])
  })

  // #580: a failed fetch is asked again on reconnect, no sooner than the
  // pod's Retry-After, as the perimeters are.
  it('asks again on reconnect, no sooner than the pod’s Retry-After', async () => {
    fetchFireActivity
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { retryAfterS: 30 }))
      .mockResolvedValueOnce(DETECTIONS)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const online = new EventTarget()
    const stub = stubMap({ zoom: 8 })
    const layer = mountFireActivity(stub.map, { online, now: () => clock })
    layer.update({ show: true })
    await vi.advanceTimersByTimeAsync(0)
    online.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(29_000)
    expect(fetchFireActivity).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetchFireActivity).toHaveBeenCalledTimes(2)
  })

  it('aborts the request in flight when switched off', () => {
    const { layer } = setup()
    layer.update({ show: true })
    const signal = fetchFireActivity.mock.calls[0][1] as AbortSignal
    layer.update({ show: false })
    expect(signal.aborted).toBe(true)
  })
})
